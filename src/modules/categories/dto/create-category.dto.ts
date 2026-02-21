import { IsString, IsOptional, MaxLength, IsBoolean } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
