import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DisputesService, CreateDisputeInput, UpdateDisputeStatusInput } from './disputes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { DisputeStatus } from './schemas/dispute.schema';

interface JwtUser {
  sub: string;
  role: UserRole;
}

@Controller()
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  // User-facing: create dispute
  @Post('disputes')
  @UseGuards(JwtAuthGuard)
  createDispute(
    @Body() body: CreateDisputeInput,
    @CurrentUser() user: JwtUser,
  ) {
    return this.disputesService.create(user.sub, body);
  }

  @Get('disputes/my')
  @UseGuards(JwtAuthGuard)
  getMyDisputes(@CurrentUser() user: JwtUser) {
    return this.disputesService.findMine(user.sub);
  }

  // Admin: list & update
  @Get('admin/disputes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminDisputes(
    @Query('status') status?: DisputeStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.disputesService.findAdmin(status, page, limit);
  }

  @Patch('admin/disputes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateDisputeStatus(
    @Param('id') id: string,
    @Body() body: UpdateDisputeStatusInput,
    @CurrentUser() user: JwtUser,
  ) {
    return this.disputesService.updateStatus(id, user.sub, user.role, body);
  }
}

