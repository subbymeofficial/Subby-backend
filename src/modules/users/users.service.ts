import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.userModel.findOne({ email: createUserDto.email });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);
    const user = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
      role: createUserDto.role || UserRole.CLIENT,
    });

    return user.save();
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
      isVerified: true,
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
    const filter: Record<string, unknown> = {};

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
    page?: number;
    limit?: number;
  }): Promise<{ contractors: UserDocument[]; total: number }> {
    const { trade, location, minRating, isVerified, page = 1, limit = 20 } = query;
    const filter: Record<string, unknown> = { role: UserRole.CONTRACTOR, isActive: true };

    if (trade) filter['trade'] = new RegExp(trade, 'i');
    if (location) filter['location'] = new RegExp(location, 'i');
    if (minRating) filter['averageRating'] = { $gte: minRating };
    if (isVerified !== undefined) filter['isVerified'] = isVerified;

    const skip = (page - 1) * limit;
    const [contractors, total] = await Promise.all([
      this.userModel.find(filter).skip(skip).limit(limit).sort({ averageRating: -1 }).exec(),
      this.userModel.countDocuments(filter),
    ]);

    return { contractors, total };
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string, includePassword = false): Promise<UserDocument | null> {
    const query = this.userModel.findOne({ email: email.toLowerCase() });
    if (includePassword) query.select('+password');
    return query.exec();
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId }).exec();
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

    await this.userModel.findByIdAndDelete(id).exec();
  }

  async countByRole(): Promise<{ client: number; contractor: number; admin: number }> {
    const [client, contractor, admin] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.CLIENT }),
      this.userModel.countDocuments({ role: UserRole.CONTRACTOR }),
      this.userModel.countDocuments({ role: UserRole.ADMIN }),
    ]);
    return { client, contractor, admin };
  }

  async saveContractor(userId: string, contractorId: string): Promise<UserDocument> {
    const contractor = await this.userModel.findById(contractorId);
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
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    if (!user.savedContractors || user.savedContractors.length === 0) return [];
    return this.userModel.find({ _id: { $in: user.savedContractors } }).exec();
  }

  async toggleAvailability(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
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
      this.userModel.countDocuments({ role: UserRole.CONTRACTOR, subscriptionStatus: 'active' }),
      this.userModel.countDocuments({ role: UserRole.CONTRACTOR, subscriptionStatus: 'trialing' }),
      this.userModel.countDocuments({ role: UserRole.CONTRACTOR, subscriptionStatus: 'past_due' }),
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
    const user = await this.userModel
      .findByIdAndUpdate(id, { subscriptionStatus: status, subscriptionPlan: plan }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async isOwnerOrAdmin(resourceOwnerId: string, requestingUserId: string, role: UserRole): Promise<boolean> {
    return role === UserRole.ADMIN || resourceOwnerId === requestingUserId;
  }

  objectIdToString(id: Types.ObjectId | string): string {
    return id.toString();
  }
}
