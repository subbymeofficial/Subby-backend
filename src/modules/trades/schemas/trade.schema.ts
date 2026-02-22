import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TradeDocument = HydratedDocument<Trade>;

const SubcategorySchema = {
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true },
  _id: false,
};

@Schema({ timestamps: true, collection: 'trades' })
export class Trade {
  @Prop({ required: true, trim: true, maxlength: 100, unique: true, index: true })
  name: string;

  @Prop({ required: true, trim: true, maxlength: 120, unique: true, index: true })
  slug: string;

  @Prop({
    type: [SubcategorySchema],
    default: [],
  })
  subcategories: Array<{ name: string; slug: string }>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TradeSchema = SchemaFactory.createForClass(Trade);

TradeSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});
