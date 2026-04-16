import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { UserRole, UserDocument } from './schemas/user.schema';
import { Types } from 'mongoose';

interface JwtUser {
  sub: string;
  role: UserRole;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put('profile-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async uploadProfileImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('Image file is required.');
    return this.usersService.uploadProfileImage(user.sub, file);
  }

  @Delete('profile-image')
  @UseGuards(JwtAuthGuard)
  async deleteProfileImage(@CurrentUser() user: JwtUser) {
    return this.usersService.deleteProfileImage(user.sub);
  }

  // GET /users/contractors - Public contractor search
  @Get('contractors')
  findContractors(
    @Query('trade') trade?: string,
    @Query('location') location?: string,
    @Query('minRating') minRating?: number,
    @Query('isVerified') isVerified?: boolean,
    @Query('minHourlyRate') minHourlyRate?: number,
    @Query('maxHourlyRate') maxHourlyRate?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.findContractors({ 
      trade, 
      location, 
      minRating, 
      isVerified, 
      minHourlyRate, 
      maxHourlyRate, 
      page, 
      limit 
    });
  }

  // GET /users/:id - Get user by ID (authenticated)
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.usersService.findById(id.toString());
  }

  // PATCH /users/:id - Update own profile (authenticated)
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: JwtUser,
  ): Promise<UserDocument> {
    const isAllowed = await this.usersService.isOwnerOrAdmin(
      id.toString(),
      currentUser.sub,
      currentUser.role,
    );
    if (!isAllowed) throw new ForbiddenException('You can only update your own profile');
    return this.usersService.update(id.toString(), updateUserDto);
  }

  // GET /users/saved-contractors - Get saved contractors
  @Get('saved-contractors/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  getSavedContractors(@CurrentUser() user: JwtUser) {
    return this.usersService.getSavedContractors(user.sub);
  }

  // POST /users/save-contractor/:contractorId - Save a contractor
  @Post('save-contractor/:contractorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  saveContractor(
    @Param('contractorId', ParseObjectIdPipe) contractorId: Types.ObjectId,
    @CurrentUser() user: JwtUser,
  ) {
    return this.usersService.saveContractor(user.sub, contractorId.toString());
  }

  // DELETE /users/save-contractor/:contractorId - Unsave a contractor
  @Delete('save-contractor/:contractorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  unsaveContractor(
    @Param('contractorId', ParseObjectIdPipe) contractorId: Types.ObjectId,
    @CurrentUser() user: JwtUser,
  ) {
    return this.usersService.unsaveContractor(user.sub, contractorId.toString());
  }

  @Patch('toggle-availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  /** @deprecated Use /availability/me/add or /availability/me/remove instead */
  toggleAvailability(@CurrentUser() user: JwtUser) {
    return this.usersService.toggleAvailability(user.sub);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async deleteSelf(@CurrentUser() user: JwtUser) {
    await this.usersService.selfDelete(user.sub);
    return { message: 'Account deleted successfully' };
  }
  // DELETE /users/:id - Admin only
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.usersService.delete(id.toString());
  }



  @Post('me/switch-role')
  @UseGuards(JwtAuthGuard)
  async switchMyRole(
    @CurrentUser() user: JwtUser,
    @Body('role') role: UserRole,
  ) {
    return this.usersService.switchActiveRole(user.sub, role);
  }

  @Post('me/add-contractor-role')
  @UseGuards(JwtAuthGuard)
  async addContractorRoleToMe(
    @CurrentUser() user: JwtUser,
    @Body() body: { successUrl?: string; cancelUrl?: string; plan?: string },
  ) {
    return this.usersService.startAddContractorRole(user.sub, body);
  }

  @Patch('me/availability')
  @UseGuards(JwtAuthGuard)
  async updateMyAvailability(
    @CurrentUser() user: JwtUser,
    @Body() dto: { isAvailable?: boolean; busyDates?: string[] },
  ) {
    return this.usersService.updateAvailability(user.sub, dto);
  }
}
