import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Listing, ListingDocument, ListingStatus } from './schemas/listing.schema';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { UserRole } from '../users/schemas/user.schema';

@Injectable()
export class ListingsService {
  constructor(
    @InjectModel(Listing.name) private listingModel: Model<ListingDocument>,
  ) {}

  async create(createListingDto: CreateListingDto, clientId: string): Promise<ListingDocument> {
    const listing = new this.listingModel({
      ...createListingDto,
      clientId: new Types.ObjectId(clientId),
      status: ListingStatus.OPEN,
    });
    return listing.save();
  }

  async findAll(query: {
    status?: ListingStatus;
    category?: string;
    location?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ listings: ListingDocument[]; total: number; page: number; limit: number }> {
    const { status, category, location, search, page = 1, limit = 20 } = query;
    const filter: Record<string, unknown> = {};

    if (status) filter['status'] = status;
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
    const listing = await this.listingModel.findById(id).exec();
    if (!listing) throw new NotFoundException('Listing not found');

    const isOwner = listing.clientId.toString() === userId;
    if (!isOwner && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own listings');
    }

    const updated = await this.listingModel
      .findByIdAndUpdate(id, { $set: updateListingDto }, { new: true, runValidators: true })
      .exec();

    return updated as ListingDocument;
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
