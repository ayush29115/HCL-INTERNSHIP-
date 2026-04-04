const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const users = [
  {
    name: 'Shop Admin',
    email: 'admin@shop.com',
    password: 'shop123',
    role: 'shop',
    phone: '+1234567890',
    businessDetails: {
      businessName: 'EcoShop Store',
      gstNumber: 'GST123456789',
      description: 'Sustainable products store'
    }
  },
  {
    name: 'Repair Admin',
    email: 'admin@repair.com',
    password: 'repair123',
    role: 'repair',
    phone: '+1234567891',
    businessDetails: {
      businessName: 'FixIt Repair Center',
      gstNumber: 'GST987654321',
      description: 'Professional repair services'
    }
  },
  {
    name: 'Recycle Admin',
    email: 'admin@recycle.com',
    password: 'recycle123',
    role: 'recycle',
    phone: '+1234567892',
    businessDetails: {
      businessName: 'Green Recycling Co',
      gstNumber: 'GST456789123',
      description: 'E-waste recycling solutions'
    }
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/repto_db');
    console.log('✅ Connected to MongoDB');

    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users');

    // Insert new users with hashed passwords
    for (const user of users) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(user.password, salt);
      
      const newUser = new User({
        ...user,
        password: hashedPassword
      });
      
      await newUser.save();
      console.log(`✅ Created user: ${user.email} (${user.role})`);
    }

    console.log('\n📝 Demo Accounts:');
    console.log('Shop:    admin@shop.com / shop123');
    console.log('Repair:  admin@repair.com / repair123');
    console.log('Recycle: admin@recycle.com / recycle123');
    console.log('\n✅ Database seeded successfully');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();