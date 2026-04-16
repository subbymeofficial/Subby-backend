import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/schemas/user.schema';

export class RegisterDto {
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

  // Legacy single role (kept for backwards compat).
  @IsEnum([UserRole.CLIENT, UserRole.CONTRACTOR])
  @IsOptional()
  role?: UserRole.CLIENT | UserRole.CONTRACTOR;

  // Dual-role: which modes the user is opting into at signup.
  @IsArray()
  @IsEnum(UserRole, { each: true })
  @IsOptional()
  roles?: UserRole[];
}
