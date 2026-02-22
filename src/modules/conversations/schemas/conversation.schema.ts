import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Listing } from '../../listings/schemas/listing.schema';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ timestamps: true, collection: 'conversations' })
export class Conversation {
  @Prop({
    type: [Types.ObjectId],
    ref: User.name,
    required: true,
  })
  participants: Types.ObjectId[];

  @Prop({
    type: Types.ObjectId,
    ref: Listing.name,
    default: null,
    index: true,
  })
  jobId?: Types.ObjectId | null;

  @Prop({ trim: true, maxlength: 500, default: '' })
  lastMessage: string;

  @Prop({ type: Date, default: Date.now })
  lastMessageAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ participants: 1, jobId: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

ConversationSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});
