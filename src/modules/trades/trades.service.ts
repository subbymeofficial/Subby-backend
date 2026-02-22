import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Trade, TradeDocument } from './schemas/trade.schema';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class TradesService {
  constructor(
    @InjectModel(Trade.name) private tradeModel: Model<TradeDocument>,
  ) {}

  async create(name: string): Promise<TradeDocument> {
    const slug = slugify(name);
    const existing = await this.tradeModel.findOne({
      $or: [{ name: new RegExp(`^${name}$`, 'i') }, { slug }],
    });
    if (existing) throw new ConflictException('Trade already exists');

    return this.tradeModel.create({ name, slug, subcategories: [] });
  }

  async findAll(): Promise<TradeDocument[]> {
    return this.tradeModel.find().sort({ name: 1 }).exec();
  }

  async findById(id: string): Promise<TradeDocument> {
    const trade = await this.tradeModel.findById(id);
    if (!trade) throw new NotFoundException('Trade not found');
    return trade;
  }

  async update(id: string, name: string): Promise<TradeDocument> {
    const trade = await this.tradeModel.findById(id);
    if (!trade) throw new NotFoundException('Trade not found');

    const slug = slugify(name);
    const existing = await this.tradeModel.findOne({
      _id: { $ne: id },
      $or: [{ name: new RegExp(`^${name}$`, 'i') }, { slug }],
    });
    if (existing) throw new ConflictException('Trade name/slug already in use');

    trade.name = name;
    trade.slug = slug;
    return trade.save();
  }

  async delete(id: string): Promise<void> {
    const trade = await this.tradeModel.findById(id);
    if (!trade) throw new NotFoundException('Trade not found');
    await this.tradeModel.findByIdAndDelete(id);
  }

  async addSubcategory(
    tradeId: string,
    name: string,
  ): Promise<TradeDocument> {
    const trade = await this.tradeModel.findById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');

    const slug = slugify(name);
    const exists = trade.subcategories.some(
      (s) => s.name.toLowerCase() === name.toLowerCase() || s.slug === slug,
    );
    if (exists) throw new ConflictException('Subcategory already exists');

    trade.subcategories.push({ name, slug });
    return trade.save();
  }

  async removeSubcategory(
    tradeId: string,
    subcategorySlug: string,
  ): Promise<TradeDocument> {
    const trade = await this.tradeModel.findById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');

    trade.subcategories = trade.subcategories.filter(
      (s) => s.slug !== subcategorySlug,
    );
    return trade.save();
  }
}
