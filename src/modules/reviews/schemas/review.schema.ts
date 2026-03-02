import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Listing } from '../../listings/schemas/listing.schema';

export type ReviewDocument = HydratedDocument<Review>;

export enum ReviewType {
  CLIENT_TO_CONTRACTOR = 'client_to_contractor',
  CONTRACTOR_TO_CLIENT = 'contractor_to_client',
}

@Schema({ timestamps: true, collection: 'reviews' })
export class Review {
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  reviewerId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  revieweeId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Listing.name,
    required: true,
    index: true,
  })
  listingId: Types.ObjectId;

  @Prop({
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be an integer between 1 and 5',
    },
  })
  rating: number;

  @Prop({ required: true, trim: true, maxlength: 1000 })
  comment: string;

  @Prop({
    required: true,
    enum: ReviewType,
    index: true,
  })
  type: ReviewType;

  @Prop({ default: false })
  isFlagged: boolean;

  @Prop({ trim: true, maxlength: 1000 })
  flagReason?: string;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  flaggedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  flaggedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Prevent duplicate reviews per listing per reviewer
ReviewSchema.index({ reviewerId: 1, listingId: 1 }, { unique: true });
ReviewSchema.index({ revieweeId: 1, rating: 1 });
ReviewSchema.index({ createdAt: -1 });

ReviewSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});
