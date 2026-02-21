import { IsEnum } from 'class-validator';

export class CreateSubscriptionDto {
  @IsEnum(['standard', 'premium'])
  plan: 'standard' | 'premium';
}
