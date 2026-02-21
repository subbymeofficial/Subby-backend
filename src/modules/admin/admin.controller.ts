import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { UserRole } from '../users/schemas/user.schema';
import { ListingStatus } from '../listings/schemas/listing.schema';
import { Types } from 'mongoose';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

class SetActiveDto {
  @IsBoolean()
  isActive: boolean;
}

class SetVerifiedDto {
  @IsBoolean()
  isVerified: boolean;
}

class SetSubscriptionDto {
  @IsString()
  @IsOptional()
  status: string | null;

  @IsString()
  @IsOptional()
  plan: string | null;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getPlatformStats();
  }

  @Get('users')
  getUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
  ) {
    return this.adminService.getAllUsers({ page, limit, search, role });
  }

  @Patch('users/:id/status')
  setUserStatus(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() body: SetActiveDto,
  ) {
    return this.adminService.setUserActive(id.toString(), body.isActive);
  }

  @Patch('users/:id/verify')
  setUserVerified(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() body: SetVerifiedDto,
  ) {
    return this.adminService.setUserVerified(id.toString(), body.isVerified);
  }

  @Patch('users/:id/subscription')
  setSubscription(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() body: SetSubscriptionDto,
  ) {
    return this.adminService.setSubscriptionStatus(
      id.toString(),
      body.status,
      body.plan,
    );
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.adminService.deleteUser(id.toString());
  }

  @Get('listings')
  getListings(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: ListingStatus,
  ) {
    return this.adminService.getAllListings({ page, limit, status });
  }

  @Get('applications')
  getApplications(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.adminService.getAllApplications({ page, limit, status });
  }

  @Get('transactions')
  getTransactions(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getAllTransactions({ page, limit, type, status });
  }

  @Get('reviews')
  getReviews(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getAllReviews({ page, limit });
  }

  @Delete('reviews/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteReview(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.adminService.deleteReview(id.toString());
  }

  @Delete('users/:id/profile-image')
  removeUserProfileImage(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.adminService.removeUserProfileImage(id.toString());
  }
}
