import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { ListingsModule } from '../listings/listings.module';
import { Application, ApplicationSchema } from '../applications/schemas/application.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { PromoCodesModule } from '../promocodes/promocodes.module';
import { AdminLogModule } from '../admin-log/admin-log.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    UsersModule,
    ListingsModule,
    NotificationsModule,
    ConversationsModule,
    PromoCodesModule,
    AdminLogModule,
    PaymentsModule,
    MongooseModule.forFeature([
      { name: Application.name, schema: ApplicationSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
