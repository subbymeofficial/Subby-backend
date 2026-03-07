import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Types } from 'mongoose';
import { IsEnum, IsDateString } from 'class-validator';
import {
  VerificationDocumentType,
} from './schemas/verification-document.schema';
import { VerificationService } from './verification.service';

interface JwtUser {
  sub: string;
  role: UserRole;
}

class UploadVerificationDto {
  @IsEnum(VerificationDocumentType)
  type: VerificationDocumentType;

  @IsDateString()
  expiryDate: string;
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
    if (!body?.expiryDate) {
      throw new BadRequestException('Verification document expiry date is required');
    }

    return this.verificationService.uploadDocument(
      user.sub,
      body.type,
      file,
      body.expiryDate,
    );
  }

  @Get('me')
  @Roles(UserRole.CONTRACTOR)
  async getMine(@CurrentUser() user: JwtUser) {
    return this.verificationService.getForUser(user.sub);
  }

  @Get('document/:id')
  @Roles(UserRole.CONTRACTOR, UserRole.ADMIN)
  async getDocument(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @CurrentUser() user: JwtUser,
  ): Promise<StreamableFile> {
    const { url, mimeType } = await this.verificationService.getDocumentForView(
      id.toString(),
      user.sub,
      user.role,
    );
    const fetchRes = await fetch(url);
    if (!fetchRes.ok) {
      throw new BadRequestException('Failed to fetch document');
    }
    const buffer = await fetchRes.arrayBuffer();
    return new StreamableFile(Buffer.from(buffer), {
      type: mimeType,
      disposition: 'inline',
    });
  }
}

