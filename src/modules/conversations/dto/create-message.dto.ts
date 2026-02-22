import { IsString, IsMongoId, IsOptional, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsMongoId()
  conversationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string;
}
