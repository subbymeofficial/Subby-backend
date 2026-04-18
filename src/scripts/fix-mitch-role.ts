import { INestApplication, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../modules/users/schemas/user.schema';

// One-off repair: Mitchell signed up as a client but runs an earthmoving
// subcontracting business, and the app doesn't yet expose a way to swap
// roles. Flip his role on Railway once, then the env var gets unset.
export async function runFixMitchRole(app: INestApplication): Promise<void> {
  const logger = new Logger('FixMitchRole');
  const email = process.env.FIX_MITCH_EMAIL || 'mitch@mcxearthmoving.com.au';
  logger.log(`Starting role fix for ${email}...`);

  const userModel: any = app.get(getModelToken(User.name));

  const before = await userModel.findOne({ email }).lean();
  if (!before) {
    logger.warn(`No user found with email=${email}`);
    return;
  }
  logger.log(
    `BEFORE: role=${before.role} roles=${JSON.stringify(before.roles)} name=${before.name}`,
  );

  const result = await userModel.updateOne(
    { email },
    {
      $set: { role: 'contractor' },
      $addToSet: { roles: 'contractor' },
    },
  );
  logger.log(
    `updateOne matched=${result.matchedCount} modified=${result.modifiedCount}`,
  );

  const after = await userModel.findOne({ email }).lean();
  logger.log(
    `AFTER:  role=${after?.role} roles=${JSON.stringify(after?.roles)} name=${after?.name}`,
  );
  logger.log('FIX COMPLETE. Unset RUN_FIX_MITCH_ROLE on Railway now.');
}
