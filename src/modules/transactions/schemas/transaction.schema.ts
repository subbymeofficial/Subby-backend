import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Listing } from '../../listings/schemas/listing.schema';

export type TransactionDocument = HydratedDocument<Transaction>;

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  ESCROW = 'escrow',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

export enum TransactionType {
  SUBSCRIPTION = 'subscription',
  QUALIFICATION_UPGRADE = 'qualification_upgrade',
  JOB_PAYMENT = 'job_payment',
}

export enum PaymentMethod {
  STRIPE = 'stripe',
}

@Schema({ timestamps: true, collection: 'transactions' })
export class Transaction {
  @Prop({ required: true, enum: TransactionType, index: true })
  type: TransactionType;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Listing.name, index: true })
  listingId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, index: true })
  contractorId?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: 'AUD', uppercase: true, maxlength: 3 })
  currency: string;

  @Prop({ required: true, enum: TransactionStatus, default: TransactionStatus.PENDING, index: true })
  status: TransactionStatus;

  @Prop({ enum: PaymentMethod, default: PaymentMethod.STRIPE })
  paymentMethod: PaymentMethod;

  @Prop({ trim: true })
  stripeSessionId?: string;

  @Prop({ trim: true })
  stripePaymentIntentId?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

TransactionSchema.index({ userId: 1, type: 1, status: 1 });
TransactionSchema.index({ listingId: 1, status: 1 });
TransactionSchema.index({ stripeSessionId: 1 });
TransactionSchema.index({ createdAt: -1 });

TransactionSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});
