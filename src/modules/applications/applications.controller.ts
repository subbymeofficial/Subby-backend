import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { UserRole } from '../users/schemas/user.schema';
import { Types } from 'mongoose';

interface JwtUser {
  sub: string;
  role: UserRole;
}

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  // POST /applications — Contractor applies
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createApplicationDto: CreateApplicationDto, @CurrentUser() user: JwtUser) {
    return this.applicationsService.create(createApplicationDto, user.sub);
  }

  // GET /applications/my — Contractor sees their own applications
  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  getMyApplications(@CurrentUser() user: JwtUser) {
    return this.applicationsService.findByContractor(user.sub);
  }

  // GET /applications/listing/:listingId — Client sees applications for their listing
  @Get('listing/:listingId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.ADMIN)
  getByListing(
    @Param('listingId', ParseObjectIdPipe) listingId: Types.ObjectId,
    @CurrentUser() user: JwtUser,
  ) {
    return this.applicationsService.findByListing(listingId.toString(), user.sub);
  }

  // GET /applications/:id — Owner of application or listing
  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.applicationsService.findById(id.toString());
  }

  // PATCH /applications/:id — Update status
  @Patch(':id')
  updateStatus(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() updateDto: UpdateApplicationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.applicationsService.updateStatus(id.toString(), updateDto, user.sub, user.role);
  }

  // DELETE /applications/:id — Contractor deletes own pending application
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @CurrentUser() user: JwtUser,
  ) {
    return this.applicationsService.delete(id.toString(), user.sub);
  }
}
