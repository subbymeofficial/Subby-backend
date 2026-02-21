import { IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../../users/schemas/user.schema';

export class GoogleAuthDto {
  @IsEnum([UserRole.CLIENT, UserRole.CONTRACTOR])
  @IsOptional()
  role?: UserRole.CLIENT | UserRole.CONTRACTOR;
}
