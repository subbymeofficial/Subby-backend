import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { UserRole } from '../users/schemas/user.schema';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async createOrGet(
    userId: string,
    participantId: string,
    jobId?: string,
  ): Promise<ConversationDocument> {
    if (userId === participantId) {
      throw new ForbiddenException('Cannot create conversation with yourself');
    }
    const participants = [
      new Types.ObjectId(userId),
      new Types.ObjectId(participantId),
    ].sort((a, b) => a.toString().localeCompare(b.toString()));

    const filter: Record<string, unknown> = {
      participants: { $all: participants },
    };
    if (jobId) filter['jobId'] = new Types.ObjectId(jobId);
    else filter['$or'] = [{ jobId: null }, { jobId: { $exists: false } }];

    let conv = await this.conversationModel.findOne(filter).exec();
    if (conv) return conv;

    conv = await this.conversationModel.create({
      participants,
      jobId: jobId ? new Types.ObjectId(jobId) : null,
      lastMessage: '',
      lastMessageAt: new Date(),
    });
    return conv;
  }

  async findByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    conversations: ConversationDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const filter = { participants: new Types.ObjectId(userId) };
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .populate('participants', 'name avatar profileImage role')
        .populate('jobId', 'title status')
        .skip(skip)
        .limit(limit)
        .sort({ lastMessageAt: -1 })
        .exec(),
      this.conversationModel.countDocuments(filter),
    ]);

    return { conversations, total, page, limit };
  }

  async findById(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<ConversationDocument> {
    const conv = await this.conversationModel
      .findById(id)
      .populate('participants', 'name avatar profileImage role')
      .populate('jobId', 'title status category')
      .exec();

    if (!conv) throw new NotFoundException('Conversation not found');

    const isParticipant = conv.participants.some(
      (p: unknown) =>
        (p as { _id?: Types.ObjectId })._id?.toString() === userId,
    );
    if (!isParticipant && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Not authorized to view this conversation');
    }

    return conv;
  }

  async validateParticipant(
    conversationId: string,
    userId: string,
  ): Promise<ConversationDocument> {
    const conv = await this.conversationModel.findById(conversationId).exec();
    if (!conv) throw new NotFoundException('Conversation not found');

    const isParticipant = conv.participants.some(
      (p) => p.toString() === userId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Not a participant in this conversation');
    }
    return conv;
  }

  async updateLastMessage(
    conversationId: string,
    lastMessage: string,
  ): Promise<void> {
    await this.conversationModel
      .findByIdAndUpdate(conversationId, {
        lastMessage: lastMessage.slice(0, 500),
        lastMessageAt: new Date(),
      })
      .exec();
  }

  async getUnreadCount(userId: string): Promise<number> {
    const myConversations = await this.conversationModel
      .find({ participants: new Types.ObjectId(userId) })
      .select('_id')
      .lean()
      .exec();

    const convIds = myConversations.map((c) => c._id);
    const count = await this.messageModel.countDocuments({
      conversationId: { $in: convIds },
      senderId: { $ne: new Types.ObjectId(userId) },
      read: false,
    });
    return count;
  }
}
