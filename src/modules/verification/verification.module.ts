import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  VerificationDocument,
  VerificationDocumentSchema,
} from './schemas/verification-document.schema';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { VerificationAdminController } from './verification-admin.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VerificationDocument.name, schema: VerificationDocumentSchema },
    ]),
    CloudinaryModule,
    UsersModule,
  ],
  controllers: [VerificationController, VerificationAdminController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}

