import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Dispute, DisputeDocument, DisputeStatus } from './schemas/dispute.schema';
import { UserRole } from '../users/schemas/user.schema';

export interface CreateDisputeInput {
  targetUserId: string;
  listingId?: string;
  reviewId?: string;
  transactionId?: string;
  reason: string;
  details: string;
}

export interface UpdateDisputeStatusInput {
  status: DisputeStatus;
  resolutionNotes?: string;
}

@Injectable()
export class DisputesService {
  constructor(
    @InjectModel(Dispute.name)
    private disputeModel: Model<DisputeDocument>,
  ) {}

  async create(
    createdBy: string,
    input: CreateDisputeInput,
  ): Promise<DisputeDocument> {
    const dispute = await this.disputeModel.create({
      createdBy: new Types.ObjectId(createdBy),
      targetUserId: new Types.ObjectId(input.targetUserId),
      listingId: input.listingId ? new Types.ObjectId(input.listingId) : null,
      reviewId: input.reviewId ? new Types.ObjectId(input.reviewId) : null,
      transactionId: input.transactionId
        ? new Types.ObjectId(input.transactionId)
        : null,
      reason: input.reason,
      details: input.details,
      status: DisputeStatus.OPEN,
    });
    return dispute;
  }

  async findMine(userId: string): Promise<DisputeDocument[]> {
    return this.disputeModel
      .find({ createdBy: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findAdmin(
    status?: DisputeStatus,
    page = 1,
    limit = 20,
  ): Promise<{ disputes: DisputeDocument[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;

    const skip = (page - 1) * limit;
    const [disputes, total] = await Promise.all([
      this.disputeModel
        .find(filter)
        .populate('createdBy', 'name email role')
        .populate('targetUserId', 'name email role')
        .populate('listingId', 'title')
        .populate('reviewId', 'rating comment')
        .populate('transactionId', 'type amount status')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.disputeModel.countDocuments(filter),
    ]);

    return { disputes, total, page, limit };
  }

  async updateStatus(
    id: string,
    adminId: string,
    adminRole: UserRole,
    input: UpdateDisputeStatusInput,
  ): Promise<DisputeDocument> {
    if (adminRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can update disputes');
    }

    const dispute = await this.disputeModel.findById(id).exec();
    if (!dispute) throw new NotFoundException('Dispute not found');

    dispute.status = input.status;
    if (input.resolutionNotes !== undefined) {
      dispute.resolutionNotes = input.resolutionNotes;
    }

    if (input.status === DisputeStatus.RESOLVED) {
      dispute.resolvedBy = new Types.ObjectId(adminId);
      dispute.resolvedAt = new Date();
    }

    return dispute.save();
  }
}

