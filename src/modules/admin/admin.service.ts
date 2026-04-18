import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
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
import { Review, ReviewDocument, ReviewStatus } from '../reviews/schemas/review.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { ChatGateway } from '../conversations/chat.gateway';
import { PromoCodesService } from '../promocodes/promocodes.service';
import { CreatePromoCodeDto } from '../promocodes/dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from '../promocodes/dto/update-promo-code.dto';
import { AdminLogService } from '../admin-log/admin-log.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class AdminService {
  constructor(
    private usersService: UsersService,
    private listingsService: ListingsService,
    private promoCodesService: PromoCodesService,
    @InjectModel(Application.name)
    private applicationModel: Model<ApplicationDocument>,
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    private notificationsService: NotificationsService,
    private chatGateway: ChatGateway,
    private adminLogService: AdminLogService,
    private paymentsService: PaymentsService,
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
    const user = await this.usersService.setActive(id, isActive);
    await this.adminLogService.log({
      adminId: id, // adminId will be set at controller layer via metadata if needed
      action: isActive ? 'user_activate' : 'user_suspend',
      targetType: 'user',
      targetId: id,
      metadata: { isActive },
    });
    return user;
  }

  async setUserVerified(id: string, isVerified: boolean) {
    const user = await this.usersService.setVerified(id, isVerified);
    await this.adminLogService.log({
      adminId: id,
      action: 'user_verify',
      targetType: 'user',
      targetId: id,
      metadata: { isVerified },
    });
    return user;
  }

  async setSubscriptionStatus(
    id: string,
    status: string | null,
    plan: string | null,
  ) {
    return this.usersService.setSubscriptionStatus(id, status, plan);
  }

  async deleteUser(id: string) {
    // Cancel any Stripe subscriptions before deleting the user
    await this.paymentsService.cancelUserSubscriptions(id);
    await this.usersService.delete(id);
    await this.adminLogService.log({
      adminId: id,
      action: 'user_delete',
      targetType: 'user',
      targetId: id,
    });
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

  async getAllReviews(query: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .populate('reviewerId', 'name avatar role')
        .populate('revieweeId', 'name avatar role')
        .populate('listingId', 'title')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.reviewModel.countDocuments(filter),
    ]);

    return { reviews, total, page, limit };
  }

  async getFlaggedReviews(query: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find({ isFlagged: true })
        .populate('reviewerId', 'name avatar role')
        .populate('revieweeId', 'name avatar role')
        .populate('listingId', 'title')
        .skip(skip)
        .limit(limit)
        .sort({ flaggedAt: -1, createdAt: -1 })
        .exec(),
      this.reviewModel.countDocuments({ isFlagged: true }),
    ]);

    return { reviews, total, page, limit };
  }

  async approveReview(id: string): Promise<ReviewDocument> {
    const review = await this.reviewModel.findById(id).exec();
    if (!review) throw new NotFoundException('Review not found');
    review.status = ReviewStatus.APPROVED;
    const saved = await review.save();
    await this.recalculateUserRating(review.revieweeId.toString());
    return saved;
  }

  async rejectReview(id: string): Promise<ReviewDocument> {
    const review = await this.reviewModel.findById(id).exec();
    if (!review) throw new NotFoundException('Review not found');
    review.status = ReviewStatus.REJECTED;
    return review.save();
  }

  async deleteReview(id: string) {
    const review = await this.reviewModel.findByIdAndDelete(id).exec();
    if (!review) return;
    await this.recalculateUserRating(review.revieweeId.toString());
    await this.adminLogService.log({
      adminId: review.revieweeId.toString(),
      action: 'review_delete',
      targetType: 'review',
      targetId: id,
    });
  }

  private async recalculateUserRating(userId: string): Promise<void> {
    const result = await this.reviewModel.aggregate<{
      avgRating: number;
      count: number;
    }>([
      {
        $match: {
          revieweeId: new Types.ObjectId(userId),
          $or: [{ status: ReviewStatus.APPROVED }, { status: { $exists: false } }],
        },
      },
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

  // ── Promo Codes ──
  async createPromoCode(dto: CreatePromoCodeDto, adminId: string) {
    const promo = await this.promoCodesService.create(dto, adminId);
    await this.adminLogService.log({
      adminId,
      action: 'promo_create',
      targetType: 'promo',
      targetId: promo._id.toString(),
      metadata: { code: promo.code },
    });
    return promo;
  }

  async getPromoCodes(page = 1, limit = 20) {
    return this.promoCodesService.findAll(page, limit);
  }

  async getPromoCodeById(id: string) {
    return this.promoCodesService.findById(id);
  }

  async updatePromoCode(id: string, dto: UpdatePromoCodeDto) {
    const promo = await this.promoCodesService.update(id, dto);
    await this.adminLogService.log({
      adminId: promo.createdBy.toString(),
      action: 'promo_update',
      targetType: 'promo',
      targetId: id,
    });
    return promo;
  }

  async deletePromoCode(id: string) {
    await this.promoCodesService.delete(id);
    await this.adminLogService.log({
      adminId: '',
      action: 'promo_delete',
      targetType: 'promo',
      targetId: id,
    });
  }

  // ── Maintenance ──
  // One-time cleanup: zero the amount on subscription transactions that never
  // actually collected money (no Stripe payment intent). Safe to run multiple
  // times; a real paid subscription will have a stripePaymentIntentId and is
  // left alone.
  async zeroOutUnchargedSubscriptionTransactions() {
    const result = await this.transactionModel.updateMany(
      {
        type: 'subscription',
        amount: { $gt: 0 },
        $or: [
          { stripePaymentIntentId: null },
          { stripePaymentIntentId: { $exists: false } },
        ],
      },
      { $set: { amount: 0 } },
    ).exec();
    return {
      matched: result.matchedCount,
      modified: result.modifiedCount,
    };
  }
}
