import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

const MAX_SVG_SIZE = 500 * 1024;

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findActive();
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllAdmin() {
    return this.categoriesService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('icon', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SVG_SIZE },
    }),
  )
  create(
    @Body() dto: CreateCategoryDto,
    @UploadedFile() iconFile?: Express.Multer.File,
  ) {
    return this.categoriesService.create(dto, iconFile);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('icon', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SVG_SIZE },
    }),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @UploadedFile() iconFile?: Express.Multer.File,
  ) {
    return this.categoriesService.update(id, dto, iconFile);
  }

  @Delete(':id/icon')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeIcon(@Param('id') id: string) {
    return this.categoriesService.removeIcon(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
