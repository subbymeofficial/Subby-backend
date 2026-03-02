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
import { Listing, ListingDocument } from '../listings/schemas/listing.schema';
import { PromoCodesService } from '../promocodes/promocodes.service';

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
    @InjectModel(Listing.name) private listingModel: Model<ListingDocument>,
    private config: ConfigService,
    private promoCodesService: PromoCodesService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY') || '');
  }

  private get frontendUrl(): string {
    return this.config.get<string>('frontendUrl') || 'http://localhost:8080';
  }

  async validatePromoCode(code: string, plan: 'standard' | 'premium') {
    return this.promoCodesService.validateForSubscription(code, plan);
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
    promoCodeId?: string,
  ): Promise<{ url: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.CONTRACTOR)
      throw new ForbiddenException('Only contractors can subscribe');

    const planConfig = PLAN_PRICES[plan];
    if (!planConfig) throw new BadRequestException('Invalid plan');

    let amount = planConfig.amount;
    let extraTrialDays = 0;
    let appliedPromoCodeId: string | null = null;

    if (promoCodeId) {
      const promoResult = await this.promoCodesService.applyForCheckout(promoCodeId, plan);
      if (promoResult) {
        amount = promoResult.amount;
        extraTrialDays = promoResult.extraTrialDays;
        appliedPromoCodeId = promoResult.promoCodeId;
      }
    }

    const customerId = await this.getOrCreateCustomer(user);

    const trialDays = user.subscriptionPlan ? 0 : planConfig.trialDays + extraTrialDays;

    const tx = await this.txModel.create({
      type: TransactionType.SUBSCRIPTION,
      userId: new Types.ObjectId(userId),
      amount,
      currency: 'AUD',
      status: TransactionStatus.PENDING,
      paymentMethod: PaymentMethod.STRIPE,
      promoCodeId: appliedPromoCodeId ? new Types.ObjectId(appliedPromoCodeId) : undefined,
      metadata: { plan, originalAmount: planConfig.amount },
    });

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'aud',
            unit_amount: amount,
            recurring: { interval: 'week' },
            product_data: { name: planConfig.name },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: {
          userId,
          plan,
          transactionId: tx._id.toString(),
          promoCodeId: appliedPromoCodeId ?? '',
          trialDays: String(trialDays),
        },
      },
      metadata: {
        userId,
        plan,
        transactionId: tx._id.toString(),
        type: 'subscription',
        promoCodeId: appliedPromoCodeId ?? '',
        trialDays: String(trialDays),
      },
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

    const listing = await this.listingModel.findById(listingId).exec();
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.assignedContractorId?.toString() !== contractorId) {
      throw new ForbiddenException(
        'You can only pay the contractor assigned to this job',
      );
    }

    if (listing.budget && typeof listing.budget.max === 'number') {
      const maxBudget = listing.budget.max || listing.budget.min;
      if (amount > maxBudget) {
        throw new BadRequestException(
          'Payment amount cannot exceed the agreed job budget',
        );
      }
    }

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
        const trialDaysMeta = meta['trialDays'];
        const trialDays =
          typeof trialDaysMeta === 'string' ? Number(trialDaysMeta) || 0 : 0;
        const expires = new Date();
        if (trialDays > 0) {
          expires.setDate(expires.getDate() + trialDays);
        } else {
          // Fallback to 7 days if no explicit trial information is available
          expires.setDate(expires.getDate() + 7);
        }
        await this.userModel.findByIdAndUpdate(userId, {
          subscriptionPlan: plan,
          subscriptionStatus: 'active',
          subscriptionExpiresAt: expires,
        });
      }

      if (type === 'qualification_upgrade') {
        await this.userModel.findByIdAndUpdate(userId, {
          hasQualificationUpgrade: true,
        });
      }

      if (txId) {
        const tx = await this.txModel.findById(txId).exec();
        await this.txModel.findByIdAndUpdate(txId, { status: TransactionStatus.COMPLETED });
        if (tx?.promoCodeId) {
          await this.promoCodesService.incrementUsedCount(tx.promoCodeId.toString());
        }
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
    this.logger.log(`Fetching transactions for user: ${userId}`);
    const transactions = await this.txModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('listingId', 'title category')
      .populate('contractorId', 'name trade')
      .sort({ createdAt: -1 })
      .exec();
    this.logger.log(`Found ${transactions.length} transactions for user ${userId}`);
    return transactions;
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

  async verifyAndActivateSession(sessionId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      
      if (!session || session.payment_status !== 'paid') {
        return { success: false, message: 'Payment not completed' };
      }

      const meta = session.metadata || {};
      const sessionUserId = meta['userId'];
      
      if (sessionUserId !== userId) {
        throw new ForbiddenException('Session does not belong to this user');
      }

      await this.onCheckoutComplete(session);
      
      return { success: true, message: 'Subscription activated successfully' };
    } catch (error) {
      this.logger.error(`Error verifying session: ${(error as Error).message}`);
      throw error;
    }
  }

  async cancelUserSubscriptions(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) return;

    if (user.stripeSubscriptionId) {
      try {
        await this.stripe.subscriptions.cancel(user.stripeSubscriptionId);
      } catch (err) {
        this.logger.warn(
          `Failed to cancel Stripe subscription for user ${userId}: ${
            (err as Error).message
          }`,
        );
      }
    }
  }
}
