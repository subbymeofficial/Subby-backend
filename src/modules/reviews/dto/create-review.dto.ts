import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsMongoId,
  IsInt,
} from 'class-validator';
import { ReviewType } from '../schemas/review.schema';

export class CreateReviewDto {
  @IsMongoId()
  revieweeId: string;

  @IsMongoId()
  listingId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsNumber()
  rating: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  comment: string;

  @IsEnum(ReviewType)
  type: ReviewType;
}
