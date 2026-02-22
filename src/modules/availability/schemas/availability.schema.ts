import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type AvailabilityDocument = HydratedDocument<Availability>;

@Schema({ timestamps: true, collection: 'availability' })
export class Availability {
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    unique: true,
    index: true,
  })
  contractorId: Types.ObjectId;

  @Prop({ type: [Date], default: [], index: true })
  unavailableDates: Date[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const AvailabilitySchema = SchemaFactory.createForClass(Availability);

AvailabilitySchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});
