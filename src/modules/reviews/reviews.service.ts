import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { CreateReviewDto } from './dto/create-review.dto';
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

  async create(createReviewDto: CreateReviewDto, reviewerId: string): Promise<ReviewDocument> {
    const listing = await this.listingsService.findById(createReviewDto.listingId);
    if (listing.status !== ListingStatus.COMPLETED) {
      throw new BadRequestException(
        'You can only review after the job is completed',
      );
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
