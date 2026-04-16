import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { Listing, ListingSchema } from '../listings/schemas/listing.schema';
import { Application, ApplicationSchema } from '../applications/schemas/application.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Listing.name, schema: ListingSchema },
      { name: Application.name, schema: ApplicationSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
  
    forwardRef(() => PaymentsModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
