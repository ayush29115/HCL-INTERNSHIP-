const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// ======================
// 🔹 MIDDLEWARE
// ======================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================
// 🔹 MONGODB CONNECT
// ======================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/repto_db';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
  })
  .catch((err) => {
    console.error('❌ MongoDB error:', err.message);
  });

// ======================
// 🔹 MODELS
// ======================
const Order = require('./models/Order');
const Product = require('./models/Product');

// ======================
// 🔹 AUTH ROUTES
// ======================
const authRoutes = require('./routes/authRoutes');
app.use('/api', authRoutes);

// ======================
// 📦 GET ALL ORDERS
// ======================
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

// ======================
// 🛒 GET ALL PRODUCTS
// ======================
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

// ======================
// 📊 ADMIN METRICS
// ======================
app.get('/api/metrics', async (req, res) => {
  try {
    const orders = await Order.find();
    const products = await Product.find();

    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    res.json({
      success: true,
      totalOrders: orders.length,
      totalProducts: products.length,
      totalRevenue
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch metrics' });
  }
});

// ======================
// ❤️ HEALTH CHECK
// ======================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// ======================
// ❌ ERROR HANDLER
// ======================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Something went wrong!' });
});

// ======================
// ❌ 404 HANDLER
// ======================
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ======================
// 🚀 START SERVER
// ======================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running → http://localhost:${PORT}`);
});