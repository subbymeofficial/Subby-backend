import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/strategies/jwt.strategy';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UserRole } from '../users/schemas/user.schema';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 5;

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.conversationsService.createOrGet(
      user.sub,
      dto.participantId,
      dto.jobId,
    );
  }

  @Get()
  findMine(
    @CurrentUser() user: JwtUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.conversationsService.findByUser(user.sub, page ?? 1, limit ?? 20);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: JwtUser) {
    const count = await this.conversationsService.getUnreadCount(user.sub);
    return { count };
  }

  @Get(':id')
  findById(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.conversationsService.findById(id, user.sub, user.role as UserRole);
  }
}
