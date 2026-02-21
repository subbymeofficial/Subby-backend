import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    dto: CreateCategoryDto,
    iconFile?: Express.Multer.File,
  ): Promise<CategoryDocument> {
    const existing = await this.categoryModel.findOne({
      name: { $regex: new RegExp(`^${dto.name}$`, 'i') },
    });
    if (existing) throw new ConflictException('Category already exists');

    let iconImage: { public_id: string; url: string } | null = null;
    if (iconFile) {
      iconImage = await this.cloudinaryService.uploadSvg(
        iconFile,
        'category_icons',
      );
    }

    return this.categoryModel.create({
      name: dto.name,
      icon: dto.icon || '',
      isActive: dto.isActive ?? true,
      iconImage,
    });
  }

  async findAll(): Promise<CategoryDocument[]> {
    return this.categoryModel.find().sort({ name: 1 }).exec();
  }

  async findActive(): Promise<CategoryDocument[]> {
    return this.categoryModel.find({ isActive: true }).sort({ name: 1 }).exec();
  }

  async findById(id: string): Promise<CategoryDocument> {
    const cat = await this.categoryModel.findById(id);
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    iconFile?: Express.Multer.File,
  ): Promise<CategoryDocument> {
    const cat = await this.categoryModel.findById(id);
    if (!cat) throw new NotFoundException('Category not found');

    if (iconFile) {
      if (cat.iconImage?.public_id) {
        await this.cloudinaryService.deleteImage(cat.iconImage.public_id);
      }
      const iconImage = await this.cloudinaryService.uploadSvg(
        iconFile,
        'category_icons',
      );
      cat.iconImage = iconImage;
    }

    if (dto.name !== undefined) cat.name = dto.name;
    if (dto.icon !== undefined) cat.icon = dto.icon;
    if (dto.isActive !== undefined) cat.isActive = dto.isActive;

    return cat.save();
  }

  async remove(id: string): Promise<void> {
    const cat = await this.categoryModel.findById(id);
    if (!cat) throw new NotFoundException('Category not found');

    if (cat.iconImage?.public_id) {
      await this.cloudinaryService.deleteImage(cat.iconImage.public_id);
    }

    await this.categoryModel.findByIdAndDelete(id);
  }

  async removeIcon(id: string): Promise<CategoryDocument> {
    const cat = await this.categoryModel.findById(id);
    if (!cat) throw new NotFoundException('Category not found');

    if (cat.iconImage?.public_id) {
      await this.cloudinaryService.deleteImage(cat.iconImage.public_id);
    }
    cat.iconImage = null;
    return cat.save();
  }
}
