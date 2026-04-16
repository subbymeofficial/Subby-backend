/**
 * One-time migration: populate roles[] and activeRole from legacy role field,
 * and initialize availability for users who don't have it.
 *
 * Run from backend root:
 *   npx ts-node scripts/migrate-roles.ts
 *
 * Idempotent - safe to re-run.
 */
import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[migrate-roles] MONGODB_URI is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('db not connected');
  const users = db.collection('users');

  const total = await users.countDocuments({});
  console.log(`[migrate-roles] Total users: ${total}`);

  // 1) Seed roles[] from legacy role where roles is missing/empty
  const rolesResult = await users.updateMany(
    {
      role: { $exists: true },
      $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }, { roles: null }],
    },
    [{ $set: { roles: ['$role'] } }],
  );
  console.log(`[migrate-roles] Populated roles[] on ${rolesResult.modifiedCount} users`);

  // 2) Seed activeRole from legacy role where activeRole missing
  const activeResult = await users.updateMany(
    { role: { $exists: true }, $or: [{ activeRole: { $exists: false } }, { activeRole: null }] },
    [{ $set: { activeRole: '$role' } }],
  );
  console.log(`[migrate-roles] Populated activeRole on ${activeResult.modifiedCount} users`);

  // 3) Initialize availability for all users lacking it
  const availResult = await users.updateMany(
    { availability: { $exists: false } },
    {
      $set: {
        availability: {
          isAvailable: false,
          busyDates: [],
          updatedAt: new Date(),
        },
      },
    },
  );
  console.log(`[migrate-roles] Initialized availability on ${availResult.modifiedCount} users`);

  console.log('[migrate-roles] Done.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[migrate-roles] FAILED:', err);
  process.exit(1);
});
