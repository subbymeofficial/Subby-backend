import { INestApplication, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../modules/users/schemas/user.schema';

// One-off repair: Mitchell signed up as 'client' but is a subcontractor
// (mcxearthmoving.com.au). There's no in-app way to swap roles yet,
// so this script flips his role on Railway once.
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
  logger.log(
    'FIX COMPLETE. You can now UNSET RUN_FIX_MITCH_ROLE on Railway.',
  );
}
