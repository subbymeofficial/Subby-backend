import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Conversation } from './conversation.schema';

export type MessageDocument = HydratedDocument<Message>;

const AttachmentSchema = {
  public_id: { type: String, required: true },
  url: { type: String, required: true },
  fileType: { type: String, required: true },
};

@Schema({ timestamps: true, collection: 'messages' })
export class Message {
  @Prop({
    type: Types.ObjectId,
    ref: Conversation.name,
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  senderId: Types.ObjectId;

  @Prop({ trim: true, maxlength: 5000, default: '' })
  text: string;

  @Prop({
    type: [AttachmentSchema],
    default: [],
    _id: false,
  })
  attachments: Array<{ public_id: string; url: string; fileType: string }>;

  @Prop({ default: false, index: true })
  read: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversationId: 1, createdAt: 1 });

MessageSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});
