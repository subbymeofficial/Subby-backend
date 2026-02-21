import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsMongoId,
} from 'class-validator';

export class CreateApplicationDto {
  @IsMongoId()
  listingId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  coverLetter: string;

  @IsNumber()
  @Min(0)
  @Max(99999)
  @IsOptional()
  proposedRate?: number;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  proposedTimeline?: string;
}
