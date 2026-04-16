// server/seed.js
// Run: node seed.js
// Creates the initial Super Admin account

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('./models/User');
const ResponsiblePerson = require('./models/ResponsiblePerson');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // Create Super Admin
  const existing = await User.findOne({ username: 'superadmin' });
  if (!existing) {
    await User.create({
      username: 'superadmin',
      fullName: 'Super Administrator',
      password: 'Rekker2024!',
      role: 'super_admin',
    });
    console.log('✅ Super Admin created: username=superadmin | password=Rekker2024!');
  } else {
    console.log('ℹ️  Super Admin already exists');
  }

  // Seed some responsible persons
  const persons = ['John Kamau', 'Mary Wanjiku', 'Peter Otieno', 'Grace Muthoni'];
  for (const name of persons) {
    const p = await ResponsiblePerson.findOne({ name });
    if (!p) {
      await ResponsiblePerson.create({ name });
      console.log(`✅ Person created: ${name}`);
    }
  }

  console.log('\n🎉 Seed complete! Log in with superadmin / Rekker2024!');
  console.log('⚠️  IMPORTANT: Change the password after first login!\n');
  mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
