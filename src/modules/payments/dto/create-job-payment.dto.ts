import { IsMongoId, IsNumber, IsPositive } from 'class-validator';

export class CreateJobPaymentDto {
  @IsMongoId()
  listingId: string;

  @IsMongoId()
  contractorId: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}
