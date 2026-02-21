import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  Min,
  MaxLength,
  ValidateNested,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ListingUrgency } from '../schemas/listing.schema';

class BudgetDto {
  @IsNumber()
  @Min(0)
  min: number;

  @IsNumber()
  @IsPositive()
  max: number;

  @IsString()
  @IsOptional()
  currency?: string;
}

export class CreateListingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @ValidateNested()
  @Type(() => BudgetDto)
  @IsOptional()
  budget?: BudgetDto;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  @IsEnum(ListingUrgency)
  @IsOptional()
  urgency?: ListingUrgency;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[];
}
