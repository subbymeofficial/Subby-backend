import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PromoCode,
  PromoCodeDocument,
  PromoDiscountType,
} from './schemas/promo-code.schema';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';

const PLAN_PRICES: Record<string, number> = {
  standard: 1000,
  premium: 2500,
  client: 1000,
};
const DEFAULT_TRIAL_DAYS = 14;

export interface ValidatePromoResult {
  valid: boolean;
  promoCodeId?: string;
  code?: string;
  discountType?: PromoDiscountType;
  discountValue?: number;
  originalAmount: number;
  discountedAmount: number;
  discountAmount: number;
  extraTrialDays?: number;
  error?: string;
}

@Injectable()
export class PromoCodesService {
  constructor(
    @InjectModel(PromoCode.name)
    private promoModel: Model<PromoCodeDocument>,
  ) {}

  async create(dto: CreatePromoCodeDto, adminId: string): Promise<PromoCodeDocument> {
    const codeUpper = dto.code.trim().toUpperCase();
    const existing = await this.promoModel.findOne({ code: codeUpper }).exec();
    if (existing) {
      throw new ConflictException('Promo code already exists');
    }

    if (dto.discountType === PromoDiscountType.PERCENTAGE && dto.discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100');
    }

    const promo = await this.promoModel.create({
      code: codeUpper,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      expiryDate: new Date(dto.expiryDate),
      usageLimit: dto.usageLimit ?? null,
      usedCount: 0,
      isActive: dto.isActive ?? true,
      createdBy: new Types.ObjectId(adminId),
    });
    return promo;
  }

  async findAll(page = 1, limit = 20): Promise<{
    promoCodes: PromoCodeDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    const [promoCodes, total] = await Promise.all([
      this.promoModel
        .find()
        .populate('createdBy', 'name email')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.promoModel.countDocuments(),
    ]);
    return { promoCodes, total, page, limit };
  }

  async findById(id: string): Promise<PromoCodeDocument> {
    const promo = await this.promoModel.findById(id).populate('createdBy', 'name email').exec();
    if (!promo) throw new NotFoundException('Promo code not found');
    return promo;
  }

  async update(id: string, dto: UpdatePromoCodeDto): Promise<PromoCodeDocument> {
    const promo = await this.promoModel.findById(id).exec();
    if (!promo) throw new NotFoundException('Promo code not found');

    if (dto.code) {
      const codeUpper = dto.code.trim().toUpperCase();
      const existing = await this.promoModel.findOne({ code: codeUpper, _id: { $ne: id } }).exec();
      if (existing) throw new ConflictException('Promo code already exists');
      promo.code = codeUpper;
    }
    if (dto.discountType !== undefined) promo.discountType = dto.discountType;
    if (dto.discountValue !== undefined) promo.discountValue = dto.discountValue;
    if (dto.expiryDate !== undefined) promo.expiryDate = new Date(dto.expiryDate);
    if (dto.usageLimit !== undefined) promo.usageLimit = dto.usageLimit;
    if (dto.isActive !== undefined) promo.isActive = dto.isActive;

    return promo.save();
  }

  async delete(id: string): Promise<void> {
    const promo = await this.promoModel.findByIdAndDelete(id).exec();
    if (!promo) throw new NotFoundException('Promo code not found');
  }

  /**
   * Server-side validation for subscription. Used before checkout.
   */
  async validateForSubscription(
    code: string,
    plan: 'standard' | 'premium' | 'client',
  ): Promise<ValidatePromoResult> {
    const originalAmount = PLAN_PRICES[plan] ?? 0;
    if (originalAmount <= 0) {
      return {
        valid: false,
        originalAmount: 0,
        discountedAmount: 0,
        discountAmount: 0,
        error: 'Invalid plan',
      };
    }

    const promo = await this.promoModel.findOne({ code: code.trim().toUpperCase() }).exec();
    if (!promo) {
      return {
        valid: false,
        originalAmount,
        discountedAmount: originalAmount,
        discountAmount: 0,
        error: 'Invalid promo code',
      };
    }

    if (!promo.isActive) {
      return {
        valid: false,
        originalAmount,
        discountedAmount: originalAmount,
        discountAmount: 0,
        error: 'Promo code is not active',
      };
    }

    if (new Date() > new Date(promo.expiryDate)) {
      return {
        valid: false,
        originalAmount,
        discountedAmount: originalAmount,
        discountAmount: 0,
        error: 'Promo code has expired',
      };
    }

    if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
      return {
        valid: false,
        originalAmount,
        discountedAmount: originalAmount,
        discountAmount: 0,
        error: 'Promo code usage limit reached',
      };
    }

    let discountedAmount = originalAmount;
    let discountAmount = 0;
    let extraTrialDays = 0;

    if (promo.discountType === PromoDiscountType.PERCENTAGE) {
      const pct = Math.min(100, Math.max(0, promo.discountValue));
      discountAmount = Math.round((originalAmount * pct) / 100);
      discountedAmount = originalAmount - discountAmount;
    } else if (promo.discountType === PromoDiscountType.FREE_TIME) {
      extraTrialDays = promo.discountValue * 7;
      discountedAmount = originalAmount;
      discountAmount = 0;
    }

    return {
      valid: true,
      promoCodeId: promo._id.toString(),
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      originalAmount,
      discountedAmount,
      discountAmount,
      extraTrialDays: promo.discountType === PromoDiscountType.FREE_TIME ? extraTrialDays : undefined,
    };
  }

  /**
   * Apply promo for checkout - validates and returns discounted amount. Throws on invalid.
   */
  async applyForCheckout(
    promoCodeId: string | undefined,
    plan: 'standard' | 'premium' | 'client',
  ): Promise<{ amount: number; extraTrialDays: number; promoCodeId: string } | null> {
    if (!promoCodeId) return null;

    const promo = await this.promoModel.findById(promoCodeId).exec();
    if (!promo) throw new BadRequestException('Invalid promo code');

    const result = await this.validateForSubscription(promo.code, plan);
    if (!result.valid) {
      throw new BadRequestException(result.error ?? 'Promo code is not valid');
    }

    return {
      amount: result.discountedAmount,
      extraTrialDays: result.extraTrialDays ?? 0,
      promoCodeId: promo._id.toString(),
    };
  }

  async incrementUsedCount(promoCodeId: string): Promise<void> {
    await this.promoModel.findByIdAndUpdate(promoCodeId, { $inc: { usedCount: 1 } }).exec();
  }

  getDefaultTrialDays(): number {
    return DEFAULT_TRIAL_DAYS;
  }

  getPlanPrice(plan: 'standard' | 'premium'): number {
    return PLAN_PRICES[plan] ?? 0;
  }
}
