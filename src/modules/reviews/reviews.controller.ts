import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
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

class FlagReviewDto {
  reason?: string;
}

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // POST /reviews — Authenticated users
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createReviewDto: CreateReviewDto, @CurrentUser() user: JwtUser) {
    return this.reviewsService.create(createReviewDto, user.sub, user.role);
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

  // PATCH /reviews/:id — Reviewer can edit within time window
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() body: UpdateReviewDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reviewsService.updateReview(id.toString(), user.sub, user.role, body);
  }

  // PATCH /reviews/:id/flag — Reviewee can flag a review
  @Patch(':id/flag')
  @UseGuards(JwtAuthGuard)
  flagReview(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() body: FlagReviewDto,
    @CurrentUser() user: JwtUser,
  ) {
    if (!body || typeof body.reason === 'undefined') {
      throw new BadRequestException('Flag reason is required');
    }
    return this.reviewsService.flagReview(id.toString(), user.sub, user.role, body.reason);
  }
}
