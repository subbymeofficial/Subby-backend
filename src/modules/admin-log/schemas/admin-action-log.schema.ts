import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type AdminActionLogDocument = HydratedDocument<AdminActionLog>;

@Schema({ timestamps: true, collection: 'admin_action_logs' })
export class AdminActionLog {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  adminId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100 })
  action: string;

  @Prop({ required: true, trim: true, maxlength: 50 })
  targetType: string;

  @Prop({ type: String, trim: true, maxlength: 100, default: null })
  targetId?: string | null;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AdminActionLogSchema = SchemaFactory.createForClass(AdminActionLog);

AdminActionLogSchema.index({ adminId: 1, createdAt: -1 });
AdminActionLogSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});

