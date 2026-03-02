import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ListingsModule } from './modules/listings/listings.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { AdminModule } from './modules/admin/admin.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TradesModule } from './modules/trades/trades.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { ContactModule } from './modules/contact/contact.module';
import { PromoCodesModule } from './modules/promocodes/promocodes.module';
import { VerificationModule } from './modules/verification/verification.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { AdminLogModule } from './modules/admin-log/admin-log.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // Database
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('database.uri'),
        connectionFactory: (connection: { on: (event: string, cb: () => void) => void }) => {
          connection.on('connected', () => console.log('MongoDB connected'));
          return connection;
        },
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttl') ?? 60000,
          limit: config.get<number>('throttle.limit') ?? 100,
        },
      ],
      inject: [ConfigService],
    }),

    // Feature modules
    CloudinaryModule,
    AuthModule,
    UsersModule,
    ListingsModule,
    ApplicationsModule,
    ReviewsModule,
    AdminModule,
    PaymentsModule,
    CategoriesModule,
    ConversationsModule,
    NotificationsModule,
    TradesModule,
    AvailabilityModule,
    ContactModule,
    PromoCodesModule,
    VerificationModule,
    DisputesModule,
    AdminLogModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
