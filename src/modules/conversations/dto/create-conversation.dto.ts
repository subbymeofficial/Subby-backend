import { IsMongoId, IsOptional } from 'class-validator';

export class CreateConversationDto {
  @IsMongoId()
  participantId: string; // The other user to chat with (contractor if client, client if contractor)

  @IsOptional()
  @IsMongoId()
  jobId?: string;
}
