import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Availability, AvailabilityDocument } from './schemas/availability.schema';
import { UserRole } from '../users/schemas/user.schema';

function toDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(Availability.name)
    private availabilityModel: Model<AvailabilityDocument>,
  ) {}

  async getOrCreate(contractorId: string): Promise<AvailabilityDocument> {
    let avail = await this.availabilityModel
      .findOne({ contractorId: new Types.ObjectId(contractorId) })
      .exec();

    if (!avail) {
      avail = await this.availabilityModel.create({
        contractorId: new Types.ObjectId(contractorId),
        unavailableDates: [],
      });
    }

    // Filter out past dates
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const validDates = (avail.unavailableDates || []).filter((d) => new Date(d) >= now);
    if (validDates.length !== (avail.unavailableDates || []).length) {
      avail.unavailableDates = validDates;
      await avail.save();
    }

    return avail;
  }

  async addUnavailableDates(
    contractorId: string,
    dates: Date[],
    userId: string,
    userRole: UserRole,
  ): Promise<AvailabilityDocument> {
    if (contractorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Can only update your own availability');
    }

    const avail = await this.getOrCreate(contractorId);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const existingSet = new Set(
      (avail.unavailableDates || []).map((d) => toDateOnly(new Date(d))),
    );

    for (const d of dates) {
      const dateObj = new Date(d);
      dateObj.setHours(0, 0, 0, 0);
      if (dateObj >= now && !existingSet.has(toDateOnly(dateObj))) {
        existingSet.add(toDateOnly(dateObj));
        avail.unavailableDates.push(dateObj);
      }
    }

    avail.unavailableDates.sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );
    return avail.save();
  }

  async removeUnavailableDates(
    contractorId: string,
    dates: Date[],
    userId: string,
    userRole: UserRole,
  ): Promise<AvailabilityDocument> {
    if (contractorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Can only update your own availability');
    }

    const avail = await this.getOrCreate(contractorId);
    const toRemove = new Set(dates.map((d) => toDateOnly(new Date(d))));

    avail.unavailableDates = (avail.unavailableDates || []).filter(
      (d) => !toRemove.has(toDateOnly(new Date(d))),
    );
    return avail.save();
  }

  async getByContractor(contractorId: string): Promise<AvailabilityDocument> {
    return this.getOrCreate(contractorId);
  }

  async isAvailable(contractorId: string, date: Date): Promise<boolean> {
    const avail = await this.getOrCreate(contractorId);
    const d = toDateOnly(date);
    return !(avail.unavailableDates || []).some(
      (ud) => toDateOnly(new Date(ud)) === d,
    );
  }
}
