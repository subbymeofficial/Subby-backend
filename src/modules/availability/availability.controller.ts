import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/schemas/user.schema';
import { IsArray, IsDateString, ArrayMinSize } from 'class-validator';

class UpdateAvailabilityDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsDateString({}, { each: true })
  dates: string[];
}

@Controller('availability')
@UseGuards(JwtAuthGuard)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('me')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  getMine(@CurrentUser() user: JwtUser) {
    return this.availabilityService.getOrCreate(user.sub);
  }

  @Post('me/add')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  addUnavailable(
    @Body() dto: UpdateAvailabilityDto,
    @CurrentUser() user: JwtUser,
  ) {
    const dates = dto.dates.map((s) => new Date(s));
    return this.availabilityService.addUnavailableDates(
      user.sub,
      dates,
      user.sub,
      user.role as UserRole,
    );
  }

  @Post('me/remove')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  removeUnavailable(
    @Body() dto: UpdateAvailabilityDto,
    @CurrentUser() user: JwtUser,
  ) {
    const dates = dto.dates.map((s) => new Date(s));
    return this.availabilityService.removeUnavailableDates(
      user.sub,
      dates,
      user.sub,
      user.role as UserRole,
    );
  }

  @Get('contractor/:contractorId')
  getByContractor(@Param('contractorId') contractorId: string) {
    return this.availabilityService.getByContractor(contractorId);
  }
}
