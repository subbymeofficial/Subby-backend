import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type VerificationDocumentDocument = HydratedDocument<VerificationDocument>;

export enum VerificationDocumentType {
  QUALIFICATION = 'qualification',
  ID = 'id',
  ABN = 'abn',
  INSURANCE = 'insurance',
}

export enum VerificationDocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true, collection: 'verification_documents' })
export class VerificationDocument {
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: VerificationDocumentType,
    index: true,
  })
  type: VerificationDocumentType;

  @Prop({ required: true, trim: true })
  documentUrl: string;

  @Prop({
    type: String,
    required: true,
    enum: VerificationDocumentStatus,
    default: VerificationDocumentStatus.PENDING,
    index: true,
  })
  status: VerificationDocumentStatus;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  reviewedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  reviewedAt?: Date | null;

  @Prop({ type: String, trim: true, maxlength: 1000, default: null })
  rejectionReason?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const VerificationDocumentSchema =
  SchemaFactory.createForClass(VerificationDocument);

VerificationDocumentSchema.index({ userId: 1, type: 1, status: 1 });
VerificationDocumentSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});

