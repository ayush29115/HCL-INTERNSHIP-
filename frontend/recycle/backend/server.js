// server.js - Main backend server with real authentication
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbHelpers } = require('./database');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'repto_super_secret_key_change_this_in_production';
const JWT_EXPIRY = '7d'; // 7 days

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
    }

    try {
        // Verify JWT token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if session exists in database
        const session = await dbHelpers.validateSession(token);
        if (!session) {
            return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
        }

        // Get user data
        const user = await dbHelpers.findUserById(decoded.userId);
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found.' });
        }

        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid token.' });
    }
};

// ============= API ROUTES =============

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'REPTO backend is running with real database' });
});

// SIGNUP endpoint
app.post('/api/signup', async (req, res) => {
    try {
        const { name, contact, password } = req.body;

        // Validation
        if (!name || !contact || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'All fields are required' 
            });
        }

        if (name.length < 2) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name must be at least 2 characters' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                error: 'Password must be at least 6 characters' 
            });
        }

        // Check if user already exists
        const existingUser = await dbHelpers.findUserByContact(contact);
        if (existingUser) {
            return res.status(409).json({ 
                success: false, 
                error: 'An account with this email/mobile already exists' 
            });
        }

        // Create new user
        const newUser = await dbHelpers.createUser(name, contact, password);

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            user: newUser
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// LOGIN endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { contact, password, remember } = req.body;

        if (!contact || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email/mobile and password are required' 
            });
        }

        // Find user
        const user = await dbHelpers.findUserByContact(contact);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'No account found with that email/mobile' 
            });
        }

        // Verify password
        const isValidPassword = bcrypt.compareSync(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                error: 'Incorrect password' 
            });
        }

        // Update last login
        await dbHelpers.updateLastLogin(user.id);

        // Generate JWT token
        const expiresIn = remember ? '30d' : JWT_EXPIRY;
        const token = jwt.sign(
            { userId: user.id, contact: user.contact },
            JWT_SECRET,
            { expiresIn: expiresIn }
        );

        // Calculate expiry date
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + (remember ? 30 : 7));

        // Save session in database
        await dbHelpers.saveSession(user.id, token, expiryDate.toISOString());

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                contact: user.contact
            },
            token: token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// VERIFY TOKEN endpoint
app.post('/api/verify', authenticateToken, async (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// LOGOUT endpoint
app.post('/api/logout', authenticateToken, async (req, res) => {
    try {
        await dbHelpers.deleteSession(req.token);
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});

// LOGOUT FROM ALL DEVICES
app.post('/api/logout-all', authenticateToken, async (req, res) => {
    try {
        await dbHelpers.deleteAllUserSessions(req.user.id);
        res.json({ success: true, message: 'Logged out from all devices' });
    } catch (error) {
        console.error('Logout all error:', error);
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});

// GET USER PROFILE
app.get('/api/profile', authenticateToken, async (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// GET ALL USERS (admin only - for debugging)
app.get('/api/users', async (req, res) => {
    try {
        const users = await new Promise((resolve, reject) => {
            dbHelpers.db.all('SELECT id, name, contact, created_at, last_login FROM users', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════╗
    ║   🚀 REPTO BACKEND WITH REAL DATABASE RUNNING    ║
    ║   📡 http://localhost:${PORT}                      ║
    ║   💾 Database: SQLite (repto.db)                 ║
    ║   🔐 Authentication: JWT + Bcrypt                ║
    ╚══════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n📦 Closing database connection...');
    require('./database').db.close(() => {
        console.log('✅ Database closed');
        process.exit();
    });
});