import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { VerificationService } from './verification.service';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Types } from 'mongoose';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface JwtUser {
  sub: string;
  role: UserRole;
}

class ReviewVerificationDto {
  reason?: string;
}

@Controller('admin/verification')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class VerificationAdminController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get('pending')
  async getPending(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.verificationService.getPending(page, limit);
  }

  @Get('user/:userId')
  async getForUser(
    @Param('userId', ParseObjectIdPipe) userId: Types.ObjectId,
  ) {
    return this.verificationService.getForUserAdmin(userId.toString());
  }

  @Patch(':id/approve')
  async approve(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @CurrentUser() user: JwtUser,
  ) {
    return this.verificationService.approveDocument(id.toString(), user.sub);
  }

  @Patch(':id/reject')
  async reject(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() body: ReviewVerificationDto,
    @CurrentUser() user: JwtUser,
  ) {
    const reason = body?.reason ?? 'Rejected by admin';
    return this.verificationService.rejectDocument(id.toString(), user.sub, reason);
  }
}

