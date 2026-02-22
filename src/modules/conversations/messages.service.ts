import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { ConversationsService } from './conversations.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    private conversationsService: ConversationsService,
  ) {}

  async create(
    conversationId: string,
    senderId: string,
    text?: string,
    attachments?: Array<{ public_id: string; url: string; fileType: string }>,
  ): Promise<MessageDocument> {
    await this.conversationsService.validateParticipant(conversationId, senderId);

    const hasContent = (text && text.trim()) || (attachments && attachments.length > 0);
    if (!hasContent) {
      throw new BadRequestException('Message must have text or attachment');
    }

    const msg = await this.messageModel.create({
      conversationId: new Types.ObjectId(conversationId),
      senderId: new Types.ObjectId(senderId),
      text: (text || '').trim(),
      attachments: attachments || [],
      read: false,
    });

    const preview = text?.trim().slice(0, 100) || '[Attachment]';
    await this.conversationsService.updateLastMessage(conversationId, preview);

    return msg.populate('senderId', 'name avatar profileImage');
  }

  async findByConversation(
    conversationId: string,
    userId: string,
    page = 1,
    limit = 50,
  ): Promise<{
    messages: MessageDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.conversationsService.validateParticipant(conversationId, userId);

    const filter = { conversationId: new Types.ObjectId(conversationId) };
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find(filter)
        .populate('senderId', 'name avatar profileImage')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: 1 })
        .exec(),
      this.messageModel.countDocuments(filter),
    ]);

    return { messages, total, page, limit };
  }

  async markAsRead(
    conversationId: string,
    userId: string,
    messageIds?: string[],
  ): Promise<void> {
    await this.conversationsService.validateParticipant(conversationId, userId);

    const filter: Record<string, unknown> = {
      conversationId: new Types.ObjectId(conversationId),
      senderId: { $ne: new Types.ObjectId(userId) },
      read: false,
    };
    if (messageIds && messageIds.length > 0) {
      filter['_id'] = { $in: messageIds.map((id) => new Types.ObjectId(id)) };
    }

    await this.messageModel.updateMany(filter, { read: true }).exec();
  }

  async findById(id: string): Promise<MessageDocument> {
    const msg = await this.messageModel
      .findById(id)
      .populate('senderId', 'name avatar profileImage')
      .exec();

    if (!msg) throw new NotFoundException('Message not found');
    return msg;
  }
}
