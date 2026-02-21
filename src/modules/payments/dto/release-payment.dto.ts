import { IsMongoId } from 'class-validator';

export class ReleasePaymentDto {
  @IsMongoId()
  transactionId: string;
}
