import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get<string>('cloudinary.cloudName');
    const apiKey = this.configService.get<string>('cloudinary.apiKey');
    const apiSecret = this.configService.get<string>('cloudinary.apiSecret');

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    this.logger.log(
      `Cloudinary configured for cloud: ${cloudName}, key: ${apiKey ? apiKey.slice(0, 6) + '...' : 'MISSING'}`,
    );
  }

  async uploadImage(
    file: Express.Multer.File,
    folder = 'profile_images',
  ): Promise<{ public_id: string; url: string }> {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only jpeg, jpg, png, and webp are allowed.',
      );
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be under 2MB.');
    }

    try {
      const b64 = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${b64}`;

      const result: UploadApiResponse = await cloudinary.uploader.upload(
        dataUri,
        {
          folder,
          resource_type: 'image',
          overwrite: true,
        },
      );

      return {
        public_id: result.public_id,
        url: result.secure_url,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Image upload failed.';
      this.logger.error(`Cloudinary upload failed: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async uploadSvg(
    file: Express.Multer.File,
    folder = 'category_icons',
  ): Promise<{ public_id: string; url: string }> {
    const allowedMimes = ['image/svg+xml'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only SVG files are allowed.',
      );
    }

    const maxSize = 500 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('SVG file size must be under 500KB.');
    }

    try {
      const b64 = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${b64}`;

      const result: UploadApiResponse = await cloudinary.uploader.upload(
        dataUri,
        {
          folder,
          resource_type: 'image',
          overwrite: true,
          format: 'svg',
        },
      );

      return {
        public_id: result.public_id,
        url: result.secure_url,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'SVG upload failed.';
      this.logger.error(`Cloudinary SVG upload failed: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async uploadChatFile(
    file: Express.Multer.File,
    folder = 'chat_attachments',
  ): Promise<{ public_id: string; url: string; fileType: string }> {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
    ];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Allowed: jpeg, png, webp, gif, pdf.',
      );
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be under 5MB.');
    }

    const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
    // For PDFs use raw; for images use image
    try {
      const b64 = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${b64}`;

      const result: UploadApiResponse = await cloudinary.uploader.upload(
        dataUri,
        {
          folder,
          resource_type: resourceType,
          overwrite: true,
        },
      );

      return {
        public_id: result.public_id,
        url: result.secure_url,
        fileType: file.mimetype,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'File upload failed.';
      this.logger.error(`Chat file upload failed: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch {
      // Silently fail — image may already be deleted
    }
  }
}
