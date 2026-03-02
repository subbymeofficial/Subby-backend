import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminLogService } from './admin-log.service';
import { AdminActionLog, AdminActionLogSchema } from './schemas/admin-action-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminActionLog.name, schema: AdminActionLogSchema },
    ]),
  ],
  providers: [AdminLogService],
  exports: [AdminLogService],
})
export class AdminLogModule {}

