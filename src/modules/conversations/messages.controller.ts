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
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/strategies/jwt.strategy';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ChatGateway } from './chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { ConversationsService } from './conversations.service';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 5;

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly chatGateway: ChatGateway,
    private readonly notificationsService: NotificationsService,
    private readonly conversationsService: ConversationsService,
  ) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('attachments', MAX_FILES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async create(
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: JwtUser,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    let attachments: Array<{ public_id: string; url: string; fileType: string }> = [];
    if (files && files.length > 0) {
      const uploaded = await Promise.all(
        files.map((f) =>
          this.cloudinaryService.uploadChatFile(f, 'chat_attachments'),
        ),
      );
      attachments = uploaded;
    }

    const msg = await this.messagesService.create(
      dto.conversationId,
      user.sub,
      dto.text,
      attachments,
    );

    const populated = await this.messagesService.findById(msg._id.toString());
    this.chatGateway.emitNewMessage(dto.conversationId, populated);

    const conv = await this.conversationsService.findById(
      dto.conversationId,
      user.sub,
      user.role as import('../users/schemas/user.schema').UserRole,
    );
    const participants = conv.participants as { toString: () => string }[];
    const recipientId = participants.find((p) => p.toString() !== user.sub);
    if (recipientId) {
      const recipientIdStr = recipientId.toString();
      const notif = await this.notificationsService.create(
        recipientIdStr,
        NotificationType.NEW_MESSAGE,
        'You have a new message',
        dto.conversationId,
      );
      this.chatGateway.emitNotification(recipientIdStr, notif);
    }

    return populated;
  }

  @Get('conversation/:conversationId')
  findByConversation(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: JwtUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.messagesService.findByConversation(
      conversationId,
      user.sub,
      page ?? 1,
      limit ?? 50,
    );
  }

  @Post('mark-read')
  markAsRead(
    @Body() body: { conversationId: string; messageIds?: string[] },
    @CurrentUser() user: JwtUser,
  ) {
    return this.messagesService.markAsRead(
      body.conversationId,
      user.sub,
      body.messageIds,
    );
  }
}
