import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsNumber,
  Min,
  Max,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../schemas/user.schema';

export class TicketDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  expiry?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5_000_000)
  photoDataUrl?: string;
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsArray()
  @IsEnum(UserRole, { each: true })
  @IsOptional()
  roles?: UserRole[];

  @IsEnum(UserRole)
  @IsOptional()
  activeRole?: UserRole;

  @IsOptional()
  availability?: { isAvailable?: boolean; busyDates?: (Date | string)[] };

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  location?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  trade?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  tradeId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  trades?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(32)
  abn?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketDto)
  @IsOptional()
  tickets?: TicketDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  insurance?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  availableDays?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(8)
  market?: string;

  @IsNumber()
  @Min(0)
  @Max(9999)
  @IsOptional()
  hourlyRate?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];
}

