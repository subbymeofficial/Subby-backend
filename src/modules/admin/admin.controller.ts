import {
  Controller,
  Get,
  Post,
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
import { CreatePromoCodeDto } from '../promocodes/dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from '../promocodes/dto/update-promo-code.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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

interface JwtUser {
  sub: string;
  role: UserRole;
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
    @Query('status') status?: string,
  ) {
    return this.adminService.getAllReviews({ page, limit, status });
  }

  @Patch('reviews/:id/approve')
  approveReview(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.adminService.approveReview(id.toString());
  }

  @Patch('reviews/:id/reject')
  rejectReview(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.adminService.rejectReview(id.toString());
  }

  @Get('reviews/flagged')
  getFlaggedReviews(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getFlaggedReviews({ page, limit });
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

  // ── Promo Codes ──
  @Get('promo-codes')
  getPromoCodes(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getPromoCodes(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get('promo-codes/:id')
  getPromoCodeById(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.adminService.getPromoCodeById(id.toString());
  }

  @Post('promo-codes')
  @HttpCode(HttpStatus.CREATED)
  createPromoCode(
    @Body() dto: CreatePromoCodeDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.adminService.createPromoCode(dto, user.sub);
  }

  @Patch('promo-codes/:id')
  updatePromoCode(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: UpdatePromoCodeDto,
  ) {
    return this.adminService.updatePromoCode(id.toString(), dto);
  }

  @Delete('promo-codes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePromoCode(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.adminService.deletePromoCode(id.toString());
  }

  // ── Maintenance ──
  // POST /admin/maintenance/zero-trial-subscriptions
  // One-time cleanup of legacy subscription transactions that were recorded
  // at the plan price even though the user is on a free trial.
  @Post('maintenance/zero-trial-subscriptions')
  zeroTrialSubscriptions() {
    return this.adminService.zeroOutUnchargedSubscriptionTransactions();
  }
}
