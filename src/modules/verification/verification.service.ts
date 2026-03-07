import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  VerificationDocument,
  VerificationDocumentDocument,
  VerificationDocumentStatus,
  VerificationDocumentType,
} from './schemas/verification-document.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class VerificationService {
  constructor(
    @InjectModel(VerificationDocument.name)
    private verificationModel: Model<VerificationDocumentDocument>,
    private cloudinaryService: CloudinaryService,
    private usersService: UsersService,
  ) {}

  async uploadDocument(
    userId: string,
    type: VerificationDocumentType,
    file: Express.Multer.File,
    expiryDate: string,
  ): Promise<VerificationDocumentDocument> {
    const upload = await this.cloudinaryService.uploadChatFile(
      file,
      'verification_documents',
    );

    const doc = await this.verificationModel.create({
      userId: new Types.ObjectId(userId),
      type,
      documentUrl: upload.url,
      mimeType: upload.fileType || null,
      status: VerificationDocumentStatus.PENDING,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
    });

    return doc;
  }

  async getDocumentForView(
    docId: string,
    userId: string,
    userRole: string,
  ): Promise<{ url: string; mimeType: string }> {
    const doc = await this.verificationModel.findById(docId).exec();
    if (!doc) {
      throw new NotFoundException('Verification document not found');
    }
    if (userRole !== 'admin' && doc.userId.toString() !== userId) {
      throw new ForbiddenException('Access denied');
    }
    const mimeType =
      doc.mimeType ||
      (doc.documentUrl?.includes('/image/') ? 'image/jpeg' : 'application/pdf');
    return { url: doc.documentUrl, mimeType };
  }

  async getForUser(userId: string): Promise<VerificationDocumentDocument[]> {
    return this.verificationModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getForUserAdmin(userId: string): Promise<VerificationDocumentDocument[]> {
    return this.verificationModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getPending(
    page = 1,
    limit = 20,
  ): Promise<{ documents: VerificationDocumentDocument[]; total: number }> {
    const skip = (page - 1) * limit;
    const [documents, total] = await Promise.all([
      this.verificationModel
        .find({ status: VerificationDocumentStatus.PENDING })
        .populate('userId', 'name email role')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: 1 })
        .exec(),
      this.verificationModel.countDocuments({
        status: VerificationDocumentStatus.PENDING,
      }),
    ]);

    return { documents, total };
  }

  async approveDocument(
    id: string,
    adminId: string,
  ): Promise<VerificationDocumentDocument> {
    const doc = await this.verificationModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Verification document not found');
    }

    doc.status = VerificationDocumentStatus.APPROVED;
    doc.reviewedBy = new Types.ObjectId(adminId);
    doc.reviewedAt = new Date();
    doc.rejectionReason = null;

    const saved = await doc.save();
    await this.recalculateUserVerification(doc.userId.toString());
    return saved;
  }

  async rejectDocument(
    id: string,
    adminId: string,
    reason: string,
  ): Promise<VerificationDocumentDocument> {
    const doc = await this.verificationModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Verification document not found');
    }

    doc.status = VerificationDocumentStatus.REJECTED;
    doc.reviewedBy = new Types.ObjectId(adminId);
    doc.reviewedAt = new Date();
    doc.rejectionReason = reason;

    const saved = await doc.save();
    await this.recalculateUserVerification(doc.userId.toString());
    return saved;
  }

  private async recalculateUserVerification(userId: string): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);
    const docs = await this.verificationModel
      .find({
        userId: userObjectId,
        status: VerificationDocumentStatus.APPROVED,
      })
      .exec();

    const hasQualification = docs.some(
      (d) => d.type === VerificationDocumentType.QUALIFICATION,
    );

    const hasId = docs.some((d) => d.type === VerificationDocumentType.ID);
    const hasAbn = docs.some((d) => d.type === VerificationDocumentType.ABN);
    const hasInsurance = docs.some(
      (d) => d.type === VerificationDocumentType.INSURANCE,
    );

    const isVerified = hasQualification || (hasId && hasAbn && hasInsurance);

    await this.usersService.update(userId, { isVerified });
  }
}

