// database.js - SQLite database setup
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'repto.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
    // Create users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )
    `);

    // Create sessions table for token management
    db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    `);

    console.log('✅ Database tables created/verified');
});

// Helper functions
const dbHelpers = {
    // Create a new user
    createUser: (name, contact, password) => {
        return new Promise((resolve, reject) => {
            const hashedPassword = bcrypt.hashSync(password, 10);
            db.run(
                'INSERT INTO users (name, contact, password) VALUES (?, ?, ?)',
                [name, contact.toLowerCase(), hashedPassword],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, name, contact });
                }
            );
        });
    },

    // Find user by contact (email or mobile)
    findUserByContact: (contact) => {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM users WHERE contact = ?',
                [contact.toLowerCase()],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    },

    // Find user by ID
    findUserById: (id) => {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT id, name, contact, created_at, last_login FROM users WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    },

    // Update last login time
    updateLastLogin: (userId) => {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                [userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    // Save session token
    saveSession: (userId, token, expiresAt) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
                [userId, token, expiresAt],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    // Validate session token
    validateSession: (token) => {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT user_id, expires_at FROM sessions WHERE token = ?',
                [token],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    },

    // Delete session (logout)
    deleteSession: (token) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM sessions WHERE token = ?', [token], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    // Delete all user sessions (logout from all devices)
    deleteAllUserSessions: (userId) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM sessions WHERE user_id = ?', [userId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    // Get user by token
    getUserByToken: (token) => {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT u.id, u.name, u.contact, u.created_at 
                 FROM users u 
                 JOIN sessions s ON u.id = s.user_id 
                 WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`,
                [token],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }
};

module.exports = { db, dbHelpers };