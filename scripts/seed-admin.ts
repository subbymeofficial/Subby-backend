/**
 * Seed script to create the default admin user.
 * Run: npm run seed:admin
 */
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ADMIN_EMAIL = 'infosubbyme@gmail.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'SubbyMe Admin';

async function seedAdmin() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/subbyme';

  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const User = mongoose.connection.collection('users');
    const existing = await User.findOne({
      email: ADMIN_EMAIL.toLowerCase(),
      isDeleted: { $ne: true },
    });

    if (existing) {
      if (existing.role === 'admin') {
        console.log('Admin user already exists:', ADMIN_EMAIL);
        console.log('Updating password...');
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
        await User.updateOne(
          { _id: existing._id },
          { $set: { password: hashedPassword } },
        );
        console.log('Admin password updated successfully.');
      } else {
        console.log('User exists with this email but is not admin. Updating to admin...');
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
        await User.updateOne(
          { _id: existing._id },
          { $set: { role: 'admin', password: hashedPassword } },
        );
        console.log('User updated to admin successfully.');
      }
    } else {
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await User.insertOne({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL.toLowerCase(),
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        isDeleted: false,
        isVerified: true,
        averageRating: 0,
        reviewCount: 0,
        skills: [],
        savedContractors: [],
        hasQualificationUpgrade: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Admin user created successfully.');
    }

    console.log('\nAdmin login credentials:');
    console.log('  Email:', ADMIN_EMAIL);
    console.log('  Password:', ADMIN_PASSWORD);
    console.log('\nYou can now log in at the login page.');
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

seedAdmin();
