import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApplicationStatus } from '../schemas/application.schema';

export class UpdateApplicationDto {
  @IsEnum(ApplicationStatus)
  @IsNotEmpty()
  status: ApplicationStatus;
}
