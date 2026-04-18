import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  CLIENT = 'client',
  CONTRACTOR = 'contractor',
  ADMIN = 'admin',
}

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
  })
  email: string;

  @Prop({ select: false })
  password?: string;

  @Prop({
    required: true,
    enum: UserRole,
    default: UserRole.CLIENT,
    index: true,
  })
  role: UserRole;

  @Prop({
    type: [{ type: String, enum: UserRole }],
    default: undefined,
    index: true,
  })
  roles?: UserRole[];

  @Prop({
    type: String,
    enum: UserRole,
    default: undefined,
  })
  activeRole?: UserRole;

  @Prop({
    type: {
      isAvailable: { type: Boolean, default: false },
      busyDates: { type: [Date], default: [] },
      updatedAt: { type: Date, default: Date.now },
    },
    _id: false,
    default: () => ({ isAvailable: false, busyDates: [], updatedAt: new Date() }),
  })
  availability?: {
    isAvailable: boolean;
    busyDates: Date[];
    updatedAt: Date;
  };

  @Prop({ sparse: true, index: true })
  googleId?: string;

  @Prop({ trim: true })
  avatar?: string;

  @Prop({ type: { public_id: String, url: String }, default: null })
  profileImage?: { public_id: string; url: string } | null;

  @Prop({ trim: true, maxlength: 20 })
  phone?: string;

  @Prop({ trim: true, maxlength: 200 })
  location?: string;

  @Prop({ trim: true, maxlength: 1000 })
  bio?: string;

  // Contractor-specific fields
  @Prop({ trim: true, maxlength: 100 })
  trade?: string;

  @Prop({ type: String, trim: true, default: null })
  tradeId?: string | null;

  @Prop({ type: String, trim: true, default: null })
  subcategorySlug?: string | null;

  @Prop({ min: 0, max: 9999 })
  hourlyRate?: number;

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({ type: [String], default: [] })
  trades: string[];

  @Prop({ trim: true, maxlength: 32, default: '' })
  abn?: string;

  @Prop({
    type: [{
      name: { type: String, trim: true, maxlength: 120 },
      expiry: { type: String, trim: true, maxlength: 40 },
      photoDataUrl: { type: String },
    }],
    default: [],
    _id: false,
  })
  tickets: Array<{ name?: string; expiry?: string; photoDataUrl?: string }>;

  @Prop({ type: [String], default: [] })
  insurance: string[];

  @Prop({ type: [String], default: [] })
  availableDays: string[];

  @Prop({ type: String, trim: true, default: '' })
  market?: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ default: false, index: true })
  isDeleted: boolean;

  @Prop({ default: 0, min: 0, max: 5 })
  averageRating: number;

  @Prop({ default: 0, min: 0 })
  reviewCount: number;

  @Prop({ type: String, enum: ['standard', 'premium', 'client'], default: null })
  subscriptionPlan?: string | null;

  @Prop({ type: String, enum: ['active', 'trialing', 'past_due', 'cancelled'], default: null })
  subscriptionStatus?: string | null;

  @Prop({ type: String, default: null })
  stripeCustomerId?: string;

  @Prop({ type: String, default: null })
  stripeSubscriptionId?: string;

  @Prop({ type: Date, default: null })
  subscriptionExpiresAt?: Date;

  @Prop({ default: false })
  hasQualificationUpgrade: boolean;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  savedContractors: Types.ObjectId[];

  @Prop({ select: false })
  resetPasswordToken?: string;

  @Prop({ select: false })
  resetPasswordExpiry?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Compound index for contractor search
UserSchema.index({ role: 1, isActive: 1, isVerified: 1 });
UserSchema.index({ role: 1, trade: 1 });
UserSchema.index({ location: 'text', trade: 'text', bio: 'text' });

// Never return password in queries
// eslint-disable-next-line @typescript-eslint/no-explicit-any
UserSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.password = undefined;
    ret.__v = undefined;
    return ret;
  },
});
