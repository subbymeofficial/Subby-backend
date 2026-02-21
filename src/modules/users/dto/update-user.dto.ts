import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['email', 'password', 'role'] as const),
) {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  bio?: string;

  @IsString()
  @IsOptional()
  avatar?: string;
}
