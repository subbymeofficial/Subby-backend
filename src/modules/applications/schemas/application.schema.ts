import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Listing } from '../../listings/schemas/listing.schema';

export type ApplicationDocument = HydratedDocument<Application>;

export enum ApplicationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

@Schema({ timestamps: true, collection: 'applications' })
export class Application {
  @Prop({
    type: Types.ObjectId,
    ref: Listing.name,
    required: true,
    index: true,
  })
  listingId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  contractorId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  coverLetter: string;

  @Prop({ min: 0, max: 99999 })
  proposedRate?: number;

  @Prop({ trim: true, maxlength: 200 })
  proposedTimeline?: string;

  @Prop({
    required: true,
    enum: ApplicationStatus,
    default: ApplicationStatus.PENDING,
    index: true,
  })
  status: ApplicationStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);

// Prevent duplicate applications
ApplicationSchema.index({ listingId: 1, contractorId: 1 }, { unique: true });
ApplicationSchema.index({ contractorId: 1, status: 1 });
ApplicationSchema.index({ listingId: 1, status: 1 });

ApplicationSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});
