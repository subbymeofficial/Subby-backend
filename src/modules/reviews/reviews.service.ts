import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument, ReviewType } from './schemas/review.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { ListingsService } from '../listings/listings.service';
import { ListingStatus } from '../listings/schemas/listing.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { ChatGateway } from '../conversations/chat.gateway';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    private usersService: UsersService,
    private listingsService: ListingsService,
    private notificationsService: NotificationsService,
    private chatGateway: ChatGateway,
  ) {}

  async create(
    createReviewDto: CreateReviewDto,
    reviewerId: string,
    reviewerRole: UserRole,
  ): Promise<ReviewDocument> {
    const listing = await this.listingsService.findById(createReviewDto.listingId);

    // Ensure job is completed and has an assigned contractor
    if (listing.status !== ListingStatus.COMPLETED || !listing.assignedContractorId) {
      throw new ForbiddenException(
        'You can only review completed jobs with an assigned contractor',
      );
    }

    // listing.clientId and listing.assignedContractorId may be ObjectIds or populated docs
    const toIdStr = (v: unknown): string => {
      if (!v) return '';
      if (v instanceof Types.ObjectId) return v.toString();
      const obj = v as { _id?: Types.ObjectId; toString?: () => string };
      if (obj._id) return obj._id.toString();
      return String(v);
    };
    const listingClientId = toIdStr(listing.clientId);
    const listingContractorId = toIdStr(listing.assignedContractorId);
    const reviewerIdStr = new Types.ObjectId(reviewerId).toString();
    const revieweeIdStr = new Types.ObjectId(createReviewDto.revieweeId).toString();

    // Role & relationship validation based on review type
    if (createReviewDto.type === ReviewType.CLIENT_TO_CONTRACTOR) {
      if (reviewerRole !== UserRole.CLIENT) {
        throw new ForbiddenException(
          'Only clients can leave client_to_contractor reviews',
        );
      }

      if (listingClientId !== reviewerIdStr || listingContractorId !== revieweeIdStr) {
        throw new ForbiddenException(
          'You can only review the contractor assigned to your completed job',
        );
      }
    } else if (createReviewDto.type === ReviewType.CONTRACTOR_TO_CLIENT) {
      if (reviewerRole !== UserRole.CONTRACTOR) {
        throw new ForbiddenException(
          'Only contractors can leave contractor_to_client reviews',
        );
      }

      if (listingContractorId !== reviewerIdStr || listingClientId !== revieweeIdStr) {
        throw new ForbiddenException(
          'You can only review the client from your completed job',
        );
      }
    } else {
      throw new ForbiddenException('Unsupported review type');
    }

    const existing = await this.reviewModel.findOne({
      reviewerId: new Types.ObjectId(reviewerId),
      listingId: new Types.ObjectId(createReviewDto.listingId),
    });

    if (existing) {
      throw new ConflictException('You have already submitted a review for this listing');
    }

    const review = new this.reviewModel({
      ...createReviewDto,
      reviewerId: new Types.ObjectId(reviewerId),
      revieweeId: new Types.ObjectId(createReviewDto.revieweeId),
      listingId: new Types.ObjectId(createReviewDto.listingId),
    });

    const saved = await review.save();
    await this.recalculateUserRating(createReviewDto.revieweeId);

    const notif = await this.notificationsService.create(
      createReviewDto.revieweeId,
      NotificationType.REVIEW_RECEIVED,
      'You received a new review',
      saved._id.toString(),
    );
    this.chatGateway.emitNotification(createReviewDto.revieweeId, notif);

    return saved;
  }

  async findByReviewee(
    revieweeId: string,
    page = 1,
    limit = 20,
  ): Promise<{ reviews: ReviewDocument[]; total: number; averageRating: number }> {
    const filter = { revieweeId: new Types.ObjectId(revieweeId) };
    const skip = (page - 1) * limit;

    const [reviews, total, ratingAgg] = await Promise.all([
      this.reviewModel
        .find(filter)
        .populate('reviewerId', 'name avatar role')
        .populate('listingId', 'title category')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.reviewModel.countDocuments(filter),
      this.reviewModel.aggregate<{ avgRating: number }>([
        { $match: filter },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ]),
    ]);

    const averageRating =
      ratingAgg.length > 0 ? Math.round((ratingAgg[0].avgRating ?? 0) * 10) / 10 : 0;

    return { reviews, total, averageRating };
  }

  async findAll(query: {
    page?: number;
    limit?: number;
  }): Promise<{ reviews: ReviewDocument[]; total: number }> {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find()
        .populate('reviewerId', 'name avatar')
        .populate('revieweeId', 'name avatar role')
        .populate('listingId', 'title')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.reviewModel.countDocuments(),
    ]);

    return { reviews, total };
  }

  async findById(id: string): Promise<ReviewDocument> {
    const review = await this.reviewModel
      .findById(id)
      .populate('reviewerId', 'name avatar')
      .populate('revieweeId', 'name avatar role')
      .populate('listingId', 'title category')
      .exec();

    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const review = await this.reviewModel.findById(id).exec();
    if (!review) throw new NotFoundException('Review not found');

    const isOwner = review.reviewerId.toString() === userId;
    if (!isOwner && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    await this.reviewModel.findByIdAndDelete(id).exec();
    await this.recalculateUserRating(review.revieweeId.toString());
  }

  async updateReview(
    id: string,
    userId: string,
    userRole: UserRole,
    body: UpdateReviewDto,
  ): Promise<ReviewDocument> {
    const review = await this.reviewModel.findById(id).exec();
    if (!review) throw new NotFoundException('Review not found');

    const isOwner = review.reviewerId.toString() === userId;
    if (!isOwner && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    const createdAt = review.createdAt ?? new Date();
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const editWindowMs = 24 * 60 * 60 * 1000; // 24 hours

    if (diffMs > editWindowMs && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Reviews can only be edited within 24 hours of creation');
    }

    if (typeof body.rating !== 'undefined') {
      review.rating = body.rating;
    }
    if (typeof body.comment !== 'undefined') {
      review.comment = body.comment;
    }

    const saved = await review.save();
    await this.recalculateUserRating(review.revieweeId.toString());
    return saved;
  }

  async flagReview(
    id: string,
    userId: string,
    userRole: UserRole,
    reason: string,
  ): Promise<ReviewDocument> {
    const review = await this.reviewModel.findById(id).exec();
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const isReviewee = review.revieweeId.toString() === userId;
    if (!isReviewee && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only the reviewee or an admin can flag this review');
    }

    review.isFlagged = true;
    review.flagReason = reason;
    review.flaggedBy = new Types.ObjectId(userId);
    review.flaggedAt = new Date();

    return review.save();
  }

  private async recalculateUserRating(userId: string): Promise<void> {
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
    await this.usersService.updateRating(userId, avgRating, count);
  }
}
