import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ListingDocument = HydratedDocument<Listing>;

export enum ListingStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ListingUrgency {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Schema({ timestamps: true, collection: 'listings' })
export class Listing {
  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  description: string;

  @Prop({ required: true, trim: true, index: true })
  category: string;

  @Prop({ type: String, trim: true, index: true, default: null })
  tradeId?: string | null;

  @Prop({ type: String, trim: true, index: true, default: null })
  subcategorySlug?: string | null;

  @Prop({ required: true, trim: true, index: true })
  location: string;

  @Prop({
    type: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
      currency: { type: String, default: 'AUD' },
    },
    _id: false,
  })
  budget?: {
    min: number;
    max: number;
    currency: string;
  };

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ListingStatus,
    default: ListingStatus.OPEN,
    index: true,
  })
  status: ListingStatus;

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({
    enum: ListingUrgency,
    default: ListingUrgency.MEDIUM,
  })
  urgency: ListingUrgency;

  @Prop({ type: [String], default: [] })
  attachments: string[];

  @Prop({ default: 0, min: 0 })
  applicationCount: number;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    default: null,
  })
  assignedContractorId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ListingSchema = SchemaFactory.createForClass(Listing);

// Indexes
ListingSchema.index({ status: 1, category: 1 });
ListingSchema.index({ status: 1, location: 1 });
ListingSchema.index({ clientId: 1, status: 1 });
ListingSchema.index({ createdAt: -1 });
ListingSchema.index({ title: 'text', description: 'text', category: 'text' });

ListingSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});
