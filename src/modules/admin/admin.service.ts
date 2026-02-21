import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { ListingsService } from '../listings/listings.service';
import { UserRole } from '../users/schemas/user.schema';
import { ListingStatus } from '../listings/schemas/listing.schema';
import {
  Application,
  ApplicationDocument,
} from '../applications/schemas/application.schema';
import {
  Transaction,
  TransactionDocument,
} from '../transactions/schemas/transaction.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';

@Injectable()
export class AdminService {
  constructor(
    private usersService: UsersService,
    private listingsService: ListingsService,
    @InjectModel(Application.name)
    private applicationModel: Model<ApplicationDocument>,
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
  ) {}

  async getPlatformStats() {
    const [userCounts, listingCounts, subscriptionCounts, appCounts, revenueSummary, reviewCount] =
      await Promise.all([
        this.usersService.countByRole(),
        this.listingsService.countByStatus(),
        this.usersService.countSubscriptions(),
        this.applicationModel.aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        this.transactionModel.aggregate<{
          _id: null;
          totalRevenue: number;
          count: number;
        }>([
          {
            $match: {
              status: { $in: ['completed', 'released'] },
            },
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
        ]),
        this.reviewModel.countDocuments(),
      ]);

    const applicationsByStatus = appCounts.reduce(
      (acc, item) => ({ ...acc, [item._id]: item.count }),
      {} as Record<string, number>,
    );
    const totalApplications = Object.values(applicationsByStatus).reduce(
      (a, b) => a + b,
      0,
    );

    return {
      users: {
        total:
          userCounts.client + userCounts.contractor + userCounts.admin,
        ...userCounts,
      },
      listings: {
        total: Object.values(listingCounts).reduce((a, b) => a + b, 0),
        byStatus: listingCounts,
      },
      subscriptions: subscriptionCounts,
      applications: {
        total: totalApplications,
        byStatus: applicationsByStatus,
      },
      revenue: {
        total: revenueSummary.length > 0 ? revenueSummary[0].totalRevenue : 0,
        transactionCount:
          revenueSummary.length > 0 ? revenueSummary[0].count : 0,
      },
      reviews: { total: reviewCount },
    };
  }

  async getAllUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: UserRole;
  }) {
    return this.usersService.findAll(query);
  }

  async setUserActive(id: string, isActive: boolean) {
    return this.usersService.setActive(id, isActive);
  }

  async setUserVerified(id: string, isVerified: boolean) {
    return this.usersService.setVerified(id, isVerified);
  }

  async setSubscriptionStatus(
    id: string,
    status: string | null,
    plan: string | null,
  ) {
    return this.usersService.setSubscriptionStatus(id, status, plan);
  }

  async deleteUser(id: string) {
    return this.usersService.delete(id);
  }

  async getAllListings(query: {
    page?: number;
    limit?: number;
    status?: ListingStatus;
  }) {
    return this.listingsService.findAll(query);
  }

  async getAllApplications(query: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 20, status } = query;
    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;

    const skip = (page - 1) * limit;
    const [applications, total] = await Promise.all([
      this.applicationModel
        .find(filter)
        .populate('listingId', 'title category location status')
        .populate(
          'contractorId',
          'name avatar trade location averageRating isVerified',
        )
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.applicationModel.countDocuments(filter),
    ]);

    return { applications, total, page, limit };
  }

  async getAllTransactions(query: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
  }) {
    const { page = 1, limit = 20, type, status } = query;
    const filter: Record<string, unknown> = {};
    if (type) filter['type'] = type;
    if (status) filter['status'] = status;

    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .populate('userId', 'name email role')
        .populate('contractorId', 'name email')
        .populate('listingId', 'title')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.transactionModel.countDocuments(filter),
    ]);

    return { transactions, total, page, limit };
  }

  async getAllReviews(query: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find()
        .populate('reviewerId', 'name avatar role')
        .populate('revieweeId', 'name avatar role')
        .populate('listingId', 'title')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.reviewModel.countDocuments(),
    ]);

    return { reviews, total, page, limit };
  }

  async deleteReview(id: string) {
    const review = await this.reviewModel.findByIdAndDelete(id).exec();
    if (!review) return;
    await this.recalculateUserRating(review.revieweeId.toString());
  }

  private async recalculateUserRating(userId: string): Promise<void> {
    const result = await this.reviewModel.aggregate<{
      avgRating: number;
      count: number;
    }>([
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
    await this.usersService.updateRating(userId, avgRating, count);
  }

  async removeUserProfileImage(userId: string) {
    return this.usersService.adminRemoveProfileImage(userId);
  }
}
