import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true, collection: 'categories' })
export class Category {
  @Prop({ required: true, trim: true, unique: true, maxlength: 100 })
  name: string;

  @Prop({ trim: true, maxlength: 10, default: '' })
  icon: string;

  @Prop({ type: { public_id: String, url: String }, default: null })
  iconImage?: { public_id: string; url: string } | null;

  @Prop({ default: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});
