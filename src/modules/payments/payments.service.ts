import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
  PaymentMethod,
} from '../transactions/schemas/transaction.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';

const PLAN_PRICES: Record<string, { amount: number; name: string; trialDays: number }> = {
  standard: { amount: 1000, name: 'SubbyMe Standard', trialDays: 14 },
  premium: { amount: 2500, name: 'SubbyMe Premium', trialDays: 14 },
};
const QUALIFICATION_PRICE = 2000; // $20/week

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY') || '');
  }

  private get frontendUrl(): string {
    return this.config.get<string>('frontendUrl') || 'http://localhost:8080';
  }

  private async getOrCreateCustomer(user: UserDocument): Promise<string> {
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: user._id.toString(), role: user.role },
    });

    await this.userModel.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });
    return customer.id;
  }

  // ── Contractor Subscription ──
  async createSubscriptionCheckout(
    userId: string,
    plan: 'standard' | 'premium',
  ): Promise<{ url: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.CONTRACTOR)
      throw new ForbiddenException('Only contractors can subscribe');

    const planConfig = PLAN_PRICES[plan];
    if (!planConfig) throw new BadRequestException('Invalid plan');

    const customerId = await this.getOrCreateCustomer(user);

    const tx = await this.txModel.create({
      type: TransactionType.SUBSCRIPTION,
      userId: new Types.ObjectId(userId),
      amount: planConfig.amount,
      currency: 'AUD',
      status: TransactionStatus.PENDING,
      paymentMethod: PaymentMethod.STRIPE,
      metadata: { plan },
    });

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'aud',
            unit_amount: planConfig.amount,
            recurring: { interval: 'week' },
            product_data: { name: planConfig.name },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: user.subscriptionPlan ? 0 : planConfig.trialDays,
        metadata: { userId, plan, transactionId: tx._id.toString() },
      },
      metadata: { userId, plan, transactionId: tx._id.toString(), type: 'subscription' },
      success_url: `${this.frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl}/payment/cancel`,
    });

    await this.txModel.findByIdAndUpdate(tx._id, { stripeSessionId: session.id });

    return { url: session.url! };
  }

  // ── Qualification Upgrade ──
  async createQualificationCheckout(userId: string): Promise<{ url: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.CONTRACTOR)
      throw new ForbiddenException('Only contractors can upgrade qualifications');
    if (user.hasQualificationUpgrade)
      throw new BadRequestException('Already has qualification upgrade');

    const customerId = await this.getOrCreateCustomer(user);

    const tx = await this.txModel.create({
      type: TransactionType.QUALIFICATION_UPGRADE,
      userId: new Types.ObjectId(userId),
      amount: QUALIFICATION_PRICE,
      currency: 'AUD',
      status: TransactionStatus.PENDING,
      paymentMethod: PaymentMethod.STRIPE,
    });

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'aud',
            unit_amount: QUALIFICATION_PRICE,
            recurring: { interval: 'week' },
            product_data: { name: 'Verified Qualification Badge' },
          },
          quantity: 1,
        },
      ],
      metadata: { userId, transactionId: tx._id.toString(), type: 'qualification_upgrade' },
      success_url: `${this.frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl}/payment/cancel`,
    });

    await this.txModel.findByIdAndUpdate(tx._id, { stripeSessionId: session.id });

    return { url: session.url! };
  }

  // ── Job Payment (Escrow) ──
  async createJobPayment(
    clientId: string,
    listingId: string,
    contractorId: string,
    amount: number,
  ): Promise<{ url: string }> {
    const client = await this.userModel.findById(clientId);
    if (!client) throw new NotFoundException('Client not found');
    if (client.role !== UserRole.CLIENT)
      throw new ForbiddenException('Only clients can pay for jobs');

    const existing = await this.txModel.findOne({
      listingId: new Types.ObjectId(listingId),
      type: TransactionType.JOB_PAYMENT,
      status: { $in: [TransactionStatus.PENDING, TransactionStatus.ESCROW] },
    });
    if (existing) throw new BadRequestException('Payment already exists for this listing');

    const customerId = await this.getOrCreateCustomer(client);
    const amountCents = Math.round(amount * 100);

    const tx = await this.txModel.create({
      type: TransactionType.JOB_PAYMENT,
      userId: new Types.ObjectId(clientId),
      listingId: new Types.ObjectId(listingId),
      contractorId: new Types.ObjectId(contractorId),
      amount: amountCents,
      currency: 'AUD',
      status: TransactionStatus.PENDING,
      paymentMethod: PaymentMethod.STRIPE,
    });

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'aud',
            unit_amount: amountCents,
            product_data: { name: `Job Payment – Listing ${listingId.slice(-6)}` },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        capture_method: 'manual',
        metadata: {
          userId: clientId,
          listingId,
          contractorId,
          transactionId: tx._id.toString(),
          type: 'job_payment',
        },
      },
      metadata: {
        userId: clientId,
        listingId,
        contractorId,
        transactionId: tx._id.toString(),
        type: 'job_payment',
      },
      success_url: `${this.frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl}/payment/cancel`,
    });

    await this.txModel.findByIdAndUpdate(tx._id, { stripeSessionId: session.id });

    return { url: session.url! };
  }

  // ── Release Escrow ──
  async releaseJobPayment(
    transactionId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<TransactionDocument> {
    const tx = await this.txModel.findById(transactionId);
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.type !== TransactionType.JOB_PAYMENT)
      throw new BadRequestException('Not a job payment');
    if (tx.status !== TransactionStatus.ESCROW)
      throw new BadRequestException('Payment is not in escrow');

    const isOwner = tx.userId.toString() === userId;
    if (!isOwner && userRole !== UserRole.ADMIN)
      throw new ForbiddenException('Only the client or admin can release payment');

    if (tx.stripePaymentIntentId) {
      await this.stripe.paymentIntents.capture(tx.stripePaymentIntentId);
    }

    tx.status = TransactionStatus.RELEASED;
    return tx.save();
  }

  // ── Webhook Handler ──
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '';
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Stripe event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'payment_intent.succeeded':
        await this.onPaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async onCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
    const meta = session.metadata || {};
    const txId = meta['transactionId'];
    const type = meta['type'];

    if (txId) {
      await this.txModel.findByIdAndUpdate(txId, {
        stripeSessionId: session.id,
        stripePaymentIntentId: (session as unknown as Record<string, string>)['payment_intent'] ?? null,
      });
    }

    if (type === 'subscription' || type === 'qualification_upgrade') {
      const userId = meta['userId'];
      if (!userId) return;

      if (type === 'subscription') {
        const plan = meta['plan'] as 'standard' | 'premium';
        const expires = new Date();
        expires.setDate(expires.getDate() + 7);
        await this.userModel.findByIdAndUpdate(userId, {
          subscriptionPlan: plan,
          subscriptionStatus: 'active',
          subscriptionExpiresAt: expires,
        });
      }

      if (type === 'qualification_upgrade') {
        await this.userModel.findByIdAndUpdate(userId, {
          hasQualificationUpgrade: true,
          isVerified: true,
        });
      }

      if (txId) {
        await this.txModel.findByIdAndUpdate(txId, { status: TransactionStatus.COMPLETED });
      }
    }

    if (type === 'job_payment') {
      if (txId) {
        await this.txModel.findByIdAndUpdate(txId, {
          status: TransactionStatus.ESCROW,
          stripePaymentIntentId: (session as unknown as Record<string, string>)['payment_intent'],
        });
      }
    }
  }

  private async onSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
    const userId = sub.metadata?.['userId'];
    if (!userId) return;

    const statusMap: Record<string, string> = {
      active: 'active',
      trialing: 'trialing',
      past_due: 'past_due',
      canceled: 'cancelled',
    };

    await this.userModel.findByIdAndUpdate(userId, {
      subscriptionStatus: statusMap[sub.status] || sub.status,
      stripeSubscriptionId: sub.id,
    });
  }

  private async onSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    const userId = sub.metadata?.['userId'];
    if (!userId) return;

    await this.userModel.findByIdAndUpdate(userId, {
      subscriptionPlan: null,
      subscriptionStatus: 'cancelled',
      stripeSubscriptionId: null,
    });
  }

  private async onPaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
    const txId = pi.metadata?.['transactionId'];
    if (!txId) return;

    const tx = await this.txModel.findById(txId);
    if (!tx) return;

    if (tx.type === TransactionType.JOB_PAYMENT && pi.capture_method === 'manual') {
      await this.txModel.findByIdAndUpdate(txId, {
        status: TransactionStatus.ESCROW,
        stripePaymentIntentId: pi.id,
      });
    }
  }

  // ── Queries ──
  async getMyTransactions(userId: string): Promise<TransactionDocument[]> {
    return this.txModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('listingId', 'title category')
      .populate('contractorId', 'name trade')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getEscrowTransactions(listingId: string): Promise<TransactionDocument[]> {
    return this.txModel
      .find({
        listingId: new Types.ObjectId(listingId),
        type: TransactionType.JOB_PAYMENT,
        status: TransactionStatus.ESCROW,
      })
      .exec();
  }

  async getContractorEarnings(contractorId: string): Promise<{
    transactions: TransactionDocument[];
    totalEarned: number;
    pendingEscrow: number;
  }> {
    const transactions = await this.txModel
      .find({
        contractorId: new Types.ObjectId(contractorId),
        type: TransactionType.JOB_PAYMENT,
      })
      .populate('listingId', 'title category')
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .exec();

    const totalEarned = transactions
      .filter((t) => t.status === TransactionStatus.RELEASED)
      .reduce((sum, t) => sum + t.amount, 0);

    const pendingEscrow = transactions
      .filter((t) => t.status === TransactionStatus.ESCROW)
      .reduce((sum, t) => sum + t.amount, 0);

    return { transactions, totalEarned, pendingEscrow };
  }

  async getSubscriptionStatus(userId: string): Promise<{
    plan: string | null;
    status: string | null;
    expiresAt: Date | null;
    hasQualificationUpgrade: boolean;
  }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return {
      plan: user.subscriptionPlan || null,
      status: user.subscriptionStatus || null,
      expiresAt: user.subscriptionExpiresAt || null,
      hasQualificationUpgrade: user.hasQualificationUpgrade || false,
    };
  }
}
