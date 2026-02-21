import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Application,
  ApplicationDocument,
  ApplicationStatus,
} from './schemas/application.schema';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ListingsService } from '../listings/listings.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { ListingStatus } from '../listings/schemas/listing.schema';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name) private applicationModel: Model<ApplicationDocument>,
    private listingsService: ListingsService,
    private usersService: UsersService,
  ) {}

  async create(
    createApplicationDto: CreateApplicationDto,
    contractorId: string,
  ): Promise<ApplicationDocument> {
    const contractor = await this.usersService.findById(contractorId);
    const subStatus = contractor.subscriptionStatus;
    if (subStatus !== 'active' && subStatus !== 'trialing') {
      throw new ForbiddenException(
        'Active subscription required to apply for jobs. Please subscribe first.',
      );
    }

    if (
      contractor.subscriptionExpiresAt &&
      new Date() > new Date(contractor.subscriptionExpiresAt)
    ) {
      throw new ForbiddenException(
        'Your subscription has expired. Please renew to apply for jobs.',
      );
    }

    const listing = await this.listingsService.findById(createApplicationDto.listingId);

    if (listing.status !== ListingStatus.OPEN) {
      throw new BadRequestException('This listing is no longer accepting applications');
    }

    const existing = await this.applicationModel.findOne({
      listingId: new Types.ObjectId(createApplicationDto.listingId),
      contractorId: new Types.ObjectId(contractorId),
    });
    if (existing) {
      throw new ConflictException('You have already applied to this listing');
    }

    const application = new this.applicationModel({
      ...createApplicationDto,
      listingId: new Types.ObjectId(createApplicationDto.listingId),
      contractorId: new Types.ObjectId(contractorId),
    });

    const saved = await application.save();
    await this.listingsService.incrementApplicationCount(createApplicationDto.listingId);
    return saved;
  }

  async findByContractor(contractorId: string): Promise<ApplicationDocument[]> {
    return this.applicationModel
      .find({ contractorId: new Types.ObjectId(contractorId) })
      .populate('listingId', 'title category location status budget urgency')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByListing(listingId: string, clientId: string): Promise<ApplicationDocument[]> {
    const listing = await this.listingsService.findById(listingId);
    if (listing.clientId.toString() !== clientId) {
      throw new ForbiddenException('You can only view applications for your own listings');
    }

    return this.applicationModel
      .find({ listingId: new Types.ObjectId(listingId) })
      .populate('contractorId', 'name avatar trade location averageRating reviewCount isVerified')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string): Promise<ApplicationDocument> {
    const application = await this.applicationModel
      .findById(id)
      .populate('listingId', 'title category location status clientId')
      .populate('contractorId', 'name avatar trade location averageRating isVerified')
      .exec();

    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  async updateStatus(
    id: string,
    updateDto: UpdateApplicationDto,
    userId: string,
    userRole: UserRole,
  ): Promise<ApplicationDocument> {
    const application = await this.findById(id);
    const listing = await this.listingsService.findById(
      application.listingId.toString(),
    );

    const isContractor = application.contractorId.toString() === userId;
    const isListingOwner = listing.clientId.toString() === userId;

    // Contractor can only withdraw their own pending application
    if (isContractor) {
      if (updateDto.status !== ApplicationStatus.WITHDRAWN) {
        throw new ForbiddenException('Contractors can only withdraw their applications');
      }
      if (application.status !== ApplicationStatus.PENDING) {
        throw new BadRequestException('Only pending applications can be withdrawn');
      }
    } else if (isListingOwner) {
      // Client can accept or reject pending applications
      if (
        updateDto.status !== ApplicationStatus.ACCEPTED &&
        updateDto.status !== ApplicationStatus.REJECTED
      ) {
        throw new ForbiddenException('Listing owners can only accept or reject applications');
      }
    } else if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const updated = await this.applicationModel
      .findByIdAndUpdate(id, { status: updateDto.status }, { new: true })
      .exec();

    if (
      updateDto.status === ApplicationStatus.WITHDRAWN ||
      updateDto.status === ApplicationStatus.REJECTED
    ) {
      await this.listingsService.decrementApplicationCount(application.listingId.toString());
    }

    return updated as ApplicationDocument;
  }

  async delete(id: string, contractorId: string): Promise<void> {
    const application = await this.applicationModel.findById(id).exec();
    if (!application) throw new NotFoundException('Application not found');

    if (application.contractorId.toString() !== contractorId) {
      throw new ForbiddenException('You can only delete your own applications');
    }
    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException('Only pending applications can be deleted');
    }

    await this.applicationModel.findByIdAndDelete(id).exec();
    await this.listingsService.decrementApplicationCount(application.listingId.toString());
  }
}
