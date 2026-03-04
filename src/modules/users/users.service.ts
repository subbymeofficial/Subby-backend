import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MongoServerError } from 'mongodb';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Listing, ListingDocument, ListingStatus } from '../listings/schemas/listing.schema';
import {
  Application,
  ApplicationDocument,
  ApplicationStatus,
} from '../applications/schemas/application.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Listing.name) private listingModel: Model<ListingDocument>,
    @InjectModel(Application.name) private applicationModel: Model<ApplicationDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.userModel.findOne({
      email: createUserDto.email.toLowerCase().trim(),
      isDeleted: false,
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists. Please sign in or use a different email.');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);
    const user = new this.userModel({
      ...createUserDto,
      email: createUserDto.email.toLowerCase().trim(),
      password: hashedPassword,
      role: createUserDto.role || UserRole.CLIENT,
    });

    try {
      return await user.save();
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) {
        throw new ConflictException('An account with this email already exists. Please sign in or use a different email.');
      }
      throw err;
    }
  }

  async createOAuthUser(data: {
    name: string;
    email: string;
    googleId: string;
    avatar?: string;
    role?: UserRole;
  }): Promise<UserDocument> {
    const user = new this.userModel({
      ...data,
      role: data.role || UserRole.CLIENT,
    });
    return user.save();
  }

  async findAll(query: {
    role?: UserRole;
    isActive?: boolean;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ users: UserDocument[]; total: number; page: number; limit: number }> {
    const { role, isActive, page = 1, limit = 20, search } = query;
    const filter: Record<string, unknown> = { isDeleted: false };

    if (role) filter['role'] = role;
    if (isActive !== undefined) filter['isActive'] = isActive;
    if (search) {
      filter['$text'] = { $search: search };
    }

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).exec(),
      this.userModel.countDocuments(filter),
    ]);

    return { users, total, page, limit };
  }

  async findContractors(query: {
    trade?: string;
    location?: string;
    minRating?: number;
    isVerified?: boolean;
    minHourlyRate?: number;
    maxHourlyRate?: number;
    page?: number;
    limit?: number;
  }): Promise<{ contractors: UserDocument[]; total: number }> {
    const { trade, location, minRating, isVerified, minHourlyRate, maxHourlyRate, page = 1, limit = 20 } = query;
    const filter: Record<string, unknown> = {
      role: UserRole.CONTRACTOR,
      isActive: true,
      isDeleted: false,
    };

    if (trade) filter['trade'] = new RegExp(trade, 'i');
    if (location) filter['location'] = new RegExp(location, 'i');
    if (minRating) filter['averageRating'] = { $gte: minRating };
    if (isVerified !== undefined) filter['isVerified'] = isVerified;
    
    // Hourly rate filter - validate numbers are valid
    if (minHourlyRate !== undefined || maxHourlyRate !== undefined) {
      const hourlyRateFilter: Record<string, unknown> = {};
      if (minHourlyRate !== undefined && !isNaN(minHourlyRate) && minHourlyRate >= 0) {
        hourlyRateFilter['$gte'] = minHourlyRate;
      }
      if (maxHourlyRate !== undefined && !isNaN(maxHourlyRate) && maxHourlyRate >= 0) {
        hourlyRateFilter['$lte'] = maxHourlyRate;
      }
      // Only add filter if we have valid values
      if (Object.keys(hourlyRateFilter).length > 0) {
        filter['hourlyRate'] = hourlyRateFilter;
      }
    }

    const skip = (page - 1) * limit;
    const [contractors, total] = await Promise.all([
      this.userModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ isVerified: -1, hasQualificationUpgrade: -1, averageRating: -1 })
        .exec(),
      this.userModel.countDocuments(filter),
    ]);

    return { contractors, total };
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({ _id: id, isDeleted: false })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string, includePassword = false): Promise<UserDocument | null> {
    const query = this.userModel.findOne({
      email: email.toLowerCase(),
      isDeleted: false,
    });
    if (includePassword) query.select('+password');
    return query.exec();
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId, isDeleted: false }).exec();
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: updateUserDto }, { new: true, runValidators: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateRating(userId: string, newRating: number, newCount: number): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      averageRating: Math.round(newRating * 10) / 10,
      reviewCount: newCount,
    }).exec();
  }

  async setActive(id: string, isActive: boolean): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async uploadProfileImage(
    userId: string,
    file: Express.Multer.File,
  ): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.profileImage?.public_id) {
      await this.cloudinaryService.deleteImage(user.profileImage.public_id);
    }

    const uploaded = await this.cloudinaryService.uploadImage(
      file,
      'profile_images',
    );

    user.profileImage = { public_id: uploaded.public_id, url: uploaded.url };
    user.avatar = uploaded.url;
    return user.save();
  }

  async deleteProfileImage(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.profileImage?.public_id) {
      await this.cloudinaryService.deleteImage(user.profileImage.public_id);
    }

    user.profileImage = null;
    user.avatar = undefined;
    return user.save();
  }

  async adminRemoveProfileImage(userId: string): Promise<UserDocument> {
    return this.deleteProfileImage(userId);
  }

  async delete(id: string): Promise<void> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');

    if (user.profileImage?.public_id) {
      await this.cloudinaryService.deleteImage(user.profileImage.public_id);
    }

    // Basic cleanup: cancel client listings and withdraw contractor applications
    if (user.role === UserRole.CLIENT) {
      await this.listingModel.updateMany(
        { clientId: new Types.ObjectId(id) },
        { status: ListingStatus.CANCELLED },
      );
      await this.applicationModel.updateMany(
        { listingId: { $in: await this.listingModel.find({ clientId: new Types.ObjectId(id) }).distinct('_id') } },
        { status: ApplicationStatus.REJECTED },
      );
    } else if (user.role === UserRole.CONTRACTOR) {
      await this.applicationModel.updateMany(
        { contractorId: new Types.ObjectId(id) },
        { status: ApplicationStatus.WITHDRAWN },
      );
    }

    // Remove reviews authored by this user and recalculate ratings for affected reviewees
    const authoredReviews = await this.reviewModel
      .find({ reviewerId: new Types.ObjectId(id) })
      .select('revieweeId')
      .exec();
    const affectedRevieweeIds = authoredReviews.map((r) => r.revieweeId.toString());
    await this.reviewModel.deleteMany({ reviewerId: new Types.ObjectId(id) }).exec();
    for (const revieweeId of affectedRevieweeIds) {
      await this.recalculateUserRatingSafe(revieweeId);
    }

    // Hard delete: remove the user document from the database
    await this.userModel.findByIdAndDelete(id).exec();
  }

  async selfDelete(userId: string): Promise<void> {
    await this.delete(userId);
  }

  async countByRole(): Promise<{ client: number; contractor: number; admin: number }> {
    const [client, contractor, admin] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.CLIENT, isDeleted: false }),
      this.userModel.countDocuments({ role: UserRole.CONTRACTOR, isDeleted: false }),
      this.userModel.countDocuments({ role: UserRole.ADMIN, isDeleted: false }),
    ]);
    return { client, contractor, admin };
  }

  async saveContractor(userId: string, contractorId: string): Promise<UserDocument> {
    const contractor = await this.userModel.findOne({
      _id: contractorId,
      isDeleted: false,
    });
    if (!contractor || contractor.role !== UserRole.CONTRACTOR) {
      throw new NotFoundException('Contractor not found');
    }
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $addToSet: { savedContractors: new Types.ObjectId(contractorId) } },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async unsaveContractor(userId: string, contractorId: string): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $pull: { savedContractors: new Types.ObjectId(contractorId) } },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getSavedContractors(userId: string): Promise<UserDocument[]> {
    const user = await this.userModel
      .findOne({ _id: userId, isDeleted: false })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    if (!user.savedContractors || user.savedContractors.length === 0) return [];
    return this.userModel
      .find({ _id: { $in: user.savedContractors }, isDeleted: false })
      .exec();
  }

  async toggleAvailability(userId: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({ _id: userId, isDeleted: false })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    user.isActive = !user.isActive;
    return user.save();
  }

  async setVerified(id: string, isVerified: boolean): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isVerified }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async countSubscriptions(): Promise<{
    active: number;
    trialing: number;
    expired: number;
    total: number;
  }> {
    const [active, trialing, pastDue] = await Promise.all([
      this.userModel.countDocuments({
        role: UserRole.CONTRACTOR,
        subscriptionStatus: 'active',
        isDeleted: false,
      }),
      this.userModel.countDocuments({
        role: UserRole.CONTRACTOR,
        subscriptionStatus: 'trialing',
        isDeleted: false,
      }),
      this.userModel.countDocuments({
        role: UserRole.CONTRACTOR,
        subscriptionStatus: 'past_due',
        isDeleted: false,
      }),
    ]);
    return {
      active,
      trialing,
      expired: pastDue,
      total: active + trialing,
    };
  }

  async setSubscriptionStatus(
    id: string,
    status: string | null,
    plan: string | null,
  ): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');

    // Prevent manual overrides for users that have an active Stripe subscription link.
    if (user.stripeSubscriptionId) {
      throw new ForbiddenException(
        'Subscriptions linked to Stripe cannot be changed manually. Please manage them via Stripe or the normal subscription flow.',
      );
    }

    user.subscriptionStatus = status ?? null;
    user.subscriptionPlan = plan ?? null;
    return user.save();
  }

  async isOwnerOrAdmin(resourceOwnerId: string, requestingUserId: string, role: UserRole): Promise<boolean> {
    return role === UserRole.ADMIN || resourceOwnerId === requestingUserId;
  }

  objectIdToString(id: Types.ObjectId | string): string {
    return id.toString();
  }

  // Helper used after cleanup to safely recompute ratings if the user still exists
  private async recalculateUserRatingSafe(userId: string): Promise<void> {
    const result = await this.reviewModel.aggregate<{ avgRating: number; count: number }>([
      { $match: { revieweeId: new Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    const avgRating = result.length > 0 ? result[0].avgRating ?? 0 : 0;
    const count = result.length > 0 ? result[0].count ?? 0 : 0;
    await this.updateRating(userId, avgRating, count);
  }
}
