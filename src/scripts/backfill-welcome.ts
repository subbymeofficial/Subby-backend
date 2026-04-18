import { INestApplication, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../modules/users/schemas/user.schema';
import { EmailService } from '../modules/email/email.service';

/**
 * One-off backfill: sends the welcome email to any user who signed up in the
 * last 30 days (so the batch who existed before welcome emails were wired in
 * still get one).
 *
 * Triggered by setting env var RUN_WELCOME_BACKFILL=true on Railway. The
 * backfill runs once during bootstrap, then the app listens normally.
 *
 * After the logs show "BACKFILL COMPLETE", UNSET the env var on Railway so
 * a future restart does not re-send.
 */
export async function runWelcomeBackfill(
  app: INestApplication,
): Promise<void> {
  const logger = new Logger('WelcomeBackfill');
  logger.log('Starting welcome-email backfill (last 30 days)...');

  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  const emailService = app.get(EmailService);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const users = await userModel
    .find({
      createdAt: { $gte: thirtyDaysAgo },
      email: { $exists: true, $ne: null },
      isDeleted: { $ne: true },
    })
    .select('email name createdAt')
    .lean()
    .exec();

  logger.log(`Found ${users.length} user(s) created in the last 30 days`);

  let sent = 0;
  let failed = 0;

  for (const u of users) {
    if (!u.email) {
      continue;
    }
    const first = ((u.name as string) || '').split(' ')[0] || '';
    try {
      await emailService.sendWelcomeEmail(u.email, first);
      sent++;
      logger.log(`[${sent}/${users.length}] sent -> ${u.email}`);
    } catch (err) {
      failed++;
      logger.error(
        `Failed to send to ${u.email}: ${(err as Error).message}`,
      );
    }
    // Small delay so we do not trip Gmail rate limits.
    await new Promise((r) => setTimeout(r, 300));
  }

  logger.log(
    `BACKFILL COMPLETE: sent=${sent}, failed=${failed}, total=${users.length}. ` +
      'You can now UNSET RUN_WELCOME_BACKFILL on Railway.',
  );
}
