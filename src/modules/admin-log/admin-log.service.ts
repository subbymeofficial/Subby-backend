import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminActionLog, AdminActionLogDocument } from './schemas/admin-action-log.schema';

export interface LogAdminActionInput {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AdminLogService {
  constructor(
    @InjectModel(AdminActionLog.name)
    private logModel: Model<AdminActionLogDocument>,
  ) {}

  async log(input: LogAdminActionInput): Promise<void> {
    await this.logModel.create({
      adminId: new Types.ObjectId(input.adminId),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
    });
  }
}

