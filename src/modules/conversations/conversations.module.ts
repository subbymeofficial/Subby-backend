import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { ConversationsController } from './conversations.controller';
import { MessagesController } from './messages.controller';
import { ChatGateway } from './chat.gateway';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Application, ApplicationSchema } from '../applications/schemas/application.schema';
import { Listing, ListingSchema } from '../listings/schemas/listing.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Application.name, schema: ApplicationSchema },
      { name: Listing.name, schema: ListingSchema },
    ]),
    CloudinaryModule,
    forwardRef(() => NotificationsModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ConversationsController, MessagesController],
  providers: [ConversationsService, MessagesService, ChatGateway],
  exports: [ConversationsService, MessagesService, ChatGateway],
})
export class ConversationsModule {}
