import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Listing, ListingDocument, ListingStatus } from './schemas/listing.schema';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { UserRole } from '../users/schemas/user.schema';
import { InjectModel as InjectMongooseModel } from '@nestjs/mongoose';
import { Application, ApplicationDocument } from '../applications/schemas/application.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { ChatGateway } from '../conversations/chat.gateway';
import { PaymentsService } from '../payments/payments.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    @InjectModel(Listing.name) private listingModel: Model<ListingDocument>,
    @InjectMongooseModel(Application.name) private applicationModel: Model<ApplicationDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly chatGateway: ChatGateway,
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
  ) {}

  async create(createListingDto: CreateListingDto, clientId: string): Promise<ListingDocument> {
    const user = await this.usersService.findById(clientId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.CLIENT) {
      const hasActiveSubscription =
        user.subscriptionPlan === 'client' &&
        (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing');
      if (!hasActiveSubscription) {
        throw new ForbiddenException(
          'An active client subscription is required to create job listings. Subscribe at Subscription in your dashboard.',
        );
      }
    }
    const listing = new this.listingModel({
      ...createListingDto,
      clientId: new Types.ObjectId(clientId),
      status: ListingStatus.OPEN,
    });
    return listing.save();
  }

  async findAll(
    query: {
      status?: ListingStatus;
      category?: string;
      location?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    userId?: string,
    userRole?: UserRole,
  ): Promise<{ listings: ListingDocument[]; total: number; page: number; limit: number }> {
    const { status, category, location, search, page = 1, limit = 20 } = query;
    const filter: Record<string, unknown> = {};

    // Role-based security: server-side enforcement
    if (userRole === UserRole.CLIENT) {
      // Clients: only their own jobs (createdBy = clientId)
      filter['clientId'] = new Types.ObjectId(userId!);
    } else if (userRole === UserRole.CONTRACTOR) {
      // Contractors: only open jobs (never private client dashboards)
      filter['status'] = ListingStatus.OPEN;
    }
    // Admin: no extra filter (admin controller uses this for management)

    if (status && userRole !== UserRole.CONTRACTOR) filter['status'] = status;
    if (category) filter['category'] = new RegExp(category, 'i');
    if (location) filter['location'] = new RegExp(location, 'i');
    if (search) filter['$text'] = { $search: search };

    const skip = (page - 1) * limit;
    const [listings, total] = await Promise.all([
      this.listingModel
        .find(filter)
        .populate('clientId', 'name avatar location averageRating')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.listingModel.countDocuments(filter),
    ]);

    return { listings, total, page, limit };
  }

  async findById(id: string): Promise<ListingDocument> {
    const listing = await this.listingModel
      .findById(id)
      .populate('clientId', 'name avatar location averageRating reviewCount')
      .populate('assignedContractorId', 'name avatar trade averageRating')
      .exec();

    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  async getClientId(listingId: string): Promise<string> {
    const listing = await this.listingModel.findById(listingId).select('clientId').lean().exec();
    if (!listing) throw new NotFoundException('Listing not found');
    return (listing.clientId as Types.ObjectId).toString();
  }

  /**
   * Find by ID with access control. Returns 403 if user cannot access.
   */
  async findByIdWithAccess(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<ListingDocument> {
    const listing = await this.findById(id);

    if (userRole === UserRole.ADMIN) return listing;

    if (userRole === UserRole.CLIENT) {
      const isOwner = listing.clientId.toString() === userId;
      if (!isOwner) {
        throw new ForbiddenException('You can only access your own jobs');
      }
      return listing;
    }

    if (userRole === UserRole.CONTRACTOR) {
      const isOpen = listing.status === ListingStatus.OPEN;
      const isAssigned =
        listing.assignedContractorId?.toString() === userId;
      if (!isOpen && !isAssigned) {
        throw new ForbiddenException(
          'You can only view open jobs or jobs assigned to you',
        );
      }
      return listing;
    }

    throw new ForbiddenException('Unauthorized to access this job');
  }

  async findByClient(clientId: string, status?: ListingStatus): Promise<ListingDocument[]> {
    const filter: Record<string, unknown> = { clientId: new Types.ObjectId(clientId) };
    if (status) filter['status'] = status;
    return this.listingModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async update(
    id: string,
    updateListingDto: UpdateListingDto,
    userId: string,
    userRole: UserRole,
  ): Promise<ListingDocument> {
    const cleanId = typeof id === 'string' ? id.trim() : String(id);
    if (!Types.ObjectId.isValid(cleanId)) {
      throw new NotFoundException('Invalid listing ID format');
    }
    const listing = await this.listingModel.findById(cleanId).exec();
    if (!listing) throw new NotFoundException('Listing not found');

    const isOwner = listing.clientId.toString() === userId;
    if (!isOwner && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own listings');
    }

    // Business rule: after a contractor is assigned, clients may only change status,
    // not edit core listing details. Admins are exempt.
    if (listing.assignedContractorId && userRole !== UserRole.ADMIN) {
      const definedFields = Object.entries(updateListingDto).filter(
        ([, value]) => value !== undefined,
      );
      const isStatusOnlyUpdate =
        definedFields.length === 1 && definedFields[0][0] === 'status';

      if (!isStatusOnlyUpdate) {
        throw new ForbiddenException(
          'You can only change job status after a contractor has been assigned',
        );
      }
    }

    const previousStatus = listing.status;

    const updatePayload: Record<string, unknown> = { ...updateListingDto };
    if (updateListingDto.assignedContractorId && Types.ObjectId.isValid(updateListingDto.assignedContractorId)) {
      updatePayload.assignedContractorId = new Types.ObjectId(updateListingDto.assignedContractorId);
    }

    const updated = await this.listingModel
      .findByIdAndUpdate(cleanId, { $set: updatePayload }, { new: true, runValidators: true })
      .exec();

    const updatedListing = updated as ListingDocument;

    // If status changed, notify relevant parties
    if (updatedListing && updateListingDto.status && previousStatus !== updatedListing.status) {
      const clientId = updatedListing.clientId.toString();
      const assignedContractorId = updatedListing.assignedContractorId?.toString();
      const message = `Job "${updatedListing.title}" status changed from ${previousStatus} to ${updatedListing.status}`;

      const notifForClient = await this.notificationsService.create(
        clientId,
        NotificationType.JOB_STATUS_CHANGED,
        message,
        updatedListing._id.toString(),
      );
      await this.chatGateway.emitNotification(clientId, notifForClient);

      if (assignedContractorId) {
        const notifForContractor = await this.notificationsService.create(
          assignedContractorId,
          NotificationType.JOB_STATUS_CHANGED,
          message,
          updatedListing._id.toString(),
        );
        await this.chatGateway.emitNotification(assignedContractorId, notifForContractor);
      }

      // Auto-release escrow payments when job is marked completed
      if (updatedListing.status === ListingStatus.COMPLETED) {
        try {
          const escrowTxs = await this.paymentsService.getEscrowTransactions(
            updatedListing._id.toString(),
          );
          for (const tx of escrowTxs) {
            try {
              await this.paymentsService.releaseJobPayment(
                tx._id.toString(),
                clientId,
                userRole === UserRole.ADMIN ? UserRole.ADMIN : UserRole.CLIENT,
              );
              this.logger.log(
                `Auto-released escrow payment ${tx._id} for completed listing ${updatedListing._id}`,
              );
            } catch (err) {
              this.logger.warn(
                `Failed to auto-release payment ${tx._id}: ${(err as Error).message}`,
              );
            }
          }
        } catch (err) {
          this.logger.warn(
            `Failed to fetch escrow for listing ${updatedListing._id}: ${(err as Error).message}`,
          );
        }
      }
    }

    return updatedListing;
  }

  async incrementApplicationCount(listingId: string): Promise<void> {
    await this.listingModel.findByIdAndUpdate(listingId, { $inc: { applicationCount: 1 } }).exec();
  }

  async decrementApplicationCount(listingId: string): Promise<void> {
    await this.listingModel
      .findByIdAndUpdate(listingId, { $inc: { applicationCount: -1 } })
      .exec();
  }

  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const listing = await this.listingModel.findById(id).exec();
    if (!listing) throw new NotFoundException('Listing not found');

    const isOwner = listing.clientId.toString() === userId;
    if (!isOwner && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only delete your own listings');
    }

    // Clean up related applications for this listing to avoid orphan records
    await this.applicationModel.deleteMany({ listingId: new Types.ObjectId(id) }).exec();

    await this.listingModel.findByIdAndDelete(id).exec();
  }

  async countByStatus(): Promise<Record<string, number>> {
    const result = await this.listingModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return result.reduce(
      (acc, item) => ({ ...acc, [item._id]: item.count }),
      {} as Record<string, number>,
    );
  }
}
