import { IsString, MaxLength } from 'class-validator';

export class UpdateTradeDto {
  @IsString()
  @MaxLength(100)
  name: string;
}
