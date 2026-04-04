const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500', '*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Stricter rate limit for OTP
const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: { error: 'Too many OTP requests. Please wait 5 minutes.' }
});

// Logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ In-Memory Storage (Replace with Database in Production) ============
let users = [];
let otpStore = new Map();
let refreshTokens = new Map();

// ============ Helper Functions ============

// Generate OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via Email
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendOTPEmail(email, otp, type = 'login') {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #0b1e42 0%, #1b4bbe 100%); padding: 30px; text-align: center; }
        .header h1 { color: white; margin: 0; }
        .content { padding: 30px; text-align: center; }
        .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1b4bbe; background: #f0f4ff; padding: 15px; border-radius: 12px; margin: 20px 0; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>REPTO</h1>
          <p style="color: rgba(255,255,255,0.9); margin-top: 5px;">Your Electronics Hub</p>
        </div>
        <div class="content">
          <h2>${type === 'login' ? 'Login Verification' : 'Account Verification'}</h2>
          <p>Use the following OTP to complete your ${type}:</p>
          <div class="otp-code">${otp}</div>
          <p style="color: #6b7280; font-size: 14px;">This OTP is valid for 10 minutes.</p>
          <p style="color: #9ca3af; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>© 2024 REPTO. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"REPTO" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `REPTO - ${type === 'login' ? 'Login OTP' : 'Verification OTP'}`,
    html
  });
}

// Generate JWT Tokens
const jwt = require('jsonwebtoken');

function generateTokens(user) {
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      reptoCoins: user.reptoCoins
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );

  return { accessToken, refreshToken };
}

// Verify JWT Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ============ API Routes ============

// 1. Request OTP
app.post('/api/auth/request-otp', otpLimiter, [
  body('identifier').notEmpty().withMessage('Email or mobile required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const { identifier, type = 'login' } = req.body;
    const isEmail = identifier.includes('@');

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    otpStore.set(identifier, { otp, expiresAt, attempts: 0 });

    // Auto-cleanup after 10 minutes
    setTimeout(() => {
      if (otpStore.has(identifier)) {
        const stored = otpStore.get(identifier);
        if (stored.expiresAt <= Date.now()) {
          otpStore.delete(identifier);
        }
      }
    }, 10 * 60 * 1000);

    // Send OTP
    if (isEmail) {
      await sendOTPEmail(identifier, otp, type);
    } else {
      // For mobile, log OTP (integrate with SMS service here)
      console.log(`[SMS] OTP for ${identifier}: ${otp}`);
    }

    res.json({
      success: true,
      message: `OTP sent to ${isEmail ? 'email' : 'mobile'}`,
      identifier
    });
  } catch (error) {
    console.error('Request OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// 2. Verify OTP and Login/Register
app.post('/api/auth/verify-otp', [
  body('identifier').notEmpty(),
  body('otp').isLength({ min: 6, max: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid OTP format' });
  }

  try {
    const { identifier, otp, name, role } = req.body;

    // Check OTP
    const storedOTP = otpStore.get(identifier);
    if (!storedOTP) {
      return res.status(400).json({ error: 'OTP not requested or expired' });
    }

    if (Date.now() > storedOTP.expiresAt) {
      otpStore.delete(identifier);
      return res.status(400).json({ error: 'OTP expired' });
    }

    storedOTP.attempts++;
    if (storedOTP.attempts > 5) {
      otpStore.delete(identifier);
      return res.status(400).json({ error: 'Too many attempts. Request new OTP.' });
    }

    if (storedOTP.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // OTP verified, remove from store
    otpStore.delete(identifier);

    // Check if user exists
    let user = users.find(u => u.email === identifier || u.mobile === identifier);

    if (!user) {
      // Register new user
      const isEmail = identifier.includes('@');
      user = {
        id: Date.now().toString(),
        name: name || (isEmail ? identifier.split('@')[0] : 'User'),
        email: isEmail ? identifier : `${identifier}@repto.mobile`,
        mobile: !isEmail ? identifier : '',
        role: role || 'shop',
        reptoCoins: 200,
        loyaltyTier: 'Bronze',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      users.push(user);
    } else {
      // Update last login
      user.lastLogin = new Date().toISOString();
    }

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Store refresh token
    refreshTokens.set(user.id, refreshToken);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        reptoCoins: user.reptoCoins,
        loyaltyTier: user.loyaltyTier
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Login with Password (Alternative)
app.post('/api/auth/login', [
  body('identifier').notEmpty(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid credentials format' });
  }

  try {
    const { identifier, password, remember } = req.body;
    const bcrypt = require('bcryptjs');

    // Find user
    let user = users.find(u => u.email === identifier || u.mobile === identifier);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password (if user has password stored)
    if (!user.password) {
      return res.status(401).json({ error: 'Please use OTP login for this account' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    user.lastLogin = new Date().toISOString();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    
    if (remember) {
      refreshTokens.set(user.id, refreshToken);
    }

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        reptoCoins: user.reptoCoins
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Register with Password
app.post('/api/auth/register', [
  body('name').notEmpty(),
  body('identifier').notEmpty(),
  body('password').isLength({ min: 6 }),
  body('role').optional()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const { name, identifier, password, role } = req.body;
    const bcrypt = require('bcryptjs');

    // Check if user exists
    const existingUser = users.find(u => u.email === identifier || u.mobile === identifier);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const isEmail = identifier.includes('@');
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: Date.now().toString(),
      name: name,
      email: isEmail ? identifier : `${identifier}@repto.mobile`,
      mobile: !isEmail ? identifier : '',
      password: hashedPassword,
      role: role || 'shop',
      reptoCoins: 200,
      loyaltyTier: 'Bronze',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };

    users.push(newUser);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(newUser);
    refreshTokens.set(newUser.id, refreshToken);

    res.json({
      success: true,
      message: 'Registration successful',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        reptoCoins: newUser.reptoCoins
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Refresh Token
app.post('/api/auth/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const storedToken = refreshTokens.get(decoded.id);

    if (!storedToken || storedToken !== refreshToken) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const user = users.find(u => u.id === decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    refreshTokens.set(user.id, newRefreshToken);

    res.json({
      accessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// 6. Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    refreshTokens.delete(req.user.id);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 7. Verify Token
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  res.json({ valid: true, user: req.user });
});

// 8. Get User Profile
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    reptoCoins: user.reptoCoins,
    loyaltyTier: user.loyaltyTier,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin
  });
});

// 9. Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 10. Seed Demo Users (for testing)
app.post('/api/auth/seed-demo', async (req, res) => {
  const bcrypt = require('bcryptjs');
  
  const demoUsers = [
    {
      name: 'Shop Manager',
      email: 'shop@repto.com',
      mobile: '9998887771',
      password: await bcrypt.hash('shop123', 10),
      role: 'shop',
      reptoCoins: 1200,
      loyaltyTier: 'Gold'
    },
    {
      name: 'Repair Expert',
      email: 'repair@repto.com',
      mobile: '9998887772',
      password: await bcrypt.hash('repair123', 10),
      role: 'repair',
      reptoCoins: 800,
      loyaltyTier: 'Silver'
    },
    {
      name: 'Green Hero',
      email: 'recycle@repto.com',
      mobile: '9998887773',
      password: await bcrypt.hash('recycle123', 10),
      role: 'recycle',
      reptoCoins: 950,
      loyaltyTier: 'Silver'
    }
  ];

  for (const demoUser of demoUsers) {
    const exists = users.find(u => u.email === demoUser.email);
    if (!exists) {
      users.push({
        id: Date.now().toString() + Math.random(),
        ...demoUser,
        createdAt: new Date().toISOString(),
        lastLogin: null
      });
    }
  }

  res.json({ success: true, message: 'Demo users seeded', count: users.length });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 REPTO Auth Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 JWT Access Token expiry: ${process.env.JWT_ACCESS_EXPIRY || '15m'}`);
  console.log(`📧 Email configured: ${process.env.EMAIL_USER ? 'Yes' : 'No'}`);
});