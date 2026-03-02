import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Listing } from '../../listings/schemas/listing.schema';
import { Review } from '../../reviews/schemas/review.schema';
import { Transaction } from '../../transactions/schemas/transaction.schema';

export type DisputeDocument = HydratedDocument<Dispute>;

export enum DisputeStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  RESOLVED = 'resolved',
}

@Schema({ timestamps: true, collection: 'disputes' })
export class Dispute {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  targetUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Listing.name, default: null, index: true })
  listingId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: Review.name, default: null, index: true })
  reviewId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: Transaction.name, default: null, index: true })
  transactionId?: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 200 })
  reason: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  details: string;

  @Prop({
    required: true,
    enum: DisputeStatus,
    default: DisputeStatus.OPEN,
    index: true,
  })
  status: DisputeStatus;

  @Prop({ type: String, trim: true, maxlength: 2000, default: null })
  resolutionNotes?: string | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  resolvedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  resolvedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const DisputeSchema = SchemaFactory.createForClass(Dispute);

DisputeSchema.index({ createdBy: 1, status: 1 });
DisputeSchema.index({ targetUserId: 1, status: 1 });
DisputeSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});

