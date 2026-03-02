import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type NotificationDocument = HydratedDocument<Notification>;

export enum NotificationType {
  NEW_MESSAGE = 'new_message',
  REVIEW_RECEIVED = 'review_received',
  APPLICATION_ACCEPTED = 'application_accepted',
  APPLICATION_REJECTED = 'application_rejected',
  NEW_APPLICATION = 'new_application',
  JOB_STATUS_CHANGED = 'job_status_changed',
  SUBSCRIPTION_EXPIRING = 'subscription_expiring',
  VERIFICATION_STATUS = 'verification_status',
}

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    enum: NotificationType,
    index: true,
  })
  type: NotificationType;

  @Prop({ required: true, trim: true, maxlength: 500 })
  message: string;

  @Prop({ type: String, default: null, index: true })
  relatedId?: string | null;

  @Prop({ default: false, index: true })
  read: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, read: 1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });

NotificationSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});
