import {
  Controller,
  Post,
  Get,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';
import {
  VerificationDocumentType,
} from './schemas/verification-document.schema';
import { VerificationService } from './verification.service';

interface JwtUser {
  sub: string;
  role: UserRole;
}

class UploadVerificationDto {
  type: VerificationDocumentType;
}

@Controller('verification')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('upload')
  @Roles(UserRole.CONTRACTOR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadVerificationDto,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) {
      throw new BadRequestException('Verification file is required');
    }
    if (!body?.type) {
      throw new BadRequestException('Verification document type is required');
    }

    return this.verificationService.uploadDocument(user.sub, body.type, file);
  }

  @Get('me')
  @Roles(UserRole.CONTRACTOR)
  async getMine(@CurrentUser() user: JwtUser) {
    return this.verificationService.getForUser(user.sub);
  }
}

