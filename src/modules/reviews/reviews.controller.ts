import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
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

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // POST /reviews — Authenticated users
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createReviewDto: CreateReviewDto, @CurrentUser() user: JwtUser) {
    return this.reviewsService.create(createReviewDto, user.sub);
  }

  // GET /reviews/user/:userId — Get reviews for a specific user (public)
  @Get('user/:userId')
  getByUser(
    @Param('userId', ParseObjectIdPipe) userId: Types.ObjectId,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewsService.findByReviewee(userId.toString(), page, limit);
  }

  // GET /reviews — Admin only
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.reviewsService.findAll({ page, limit });
  }

  // GET /reviews/:id — Public
  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return this.reviewsService.findById(id.toString());
  }

  // DELETE /reviews/:id — Owner or Admin
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseObjectIdPipe) id: Types.ObjectId, @CurrentUser() user: JwtUser) {
    return this.reviewsService.delete(id.toString(), user.sub, user.role);
  }
}
