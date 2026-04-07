const jwt = require('jsonwebtoken');
const BlacklistToken = require('../models/BlacklistToken');

const protect = async (req, res, next) => {
    try {
        let token;
        
        // Get token from header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Not authorized. No token provided.'
            });
        }
        
        // Check if token is blacklisted (logged out)
        const isBlacklisted = await BlacklistToken.findOne({ token });
        if (isBlacklisted) {
            return res.status(401).json({
                success: false,
                error: 'Session expired. Please login again.'
            });
        }
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check token expiry
        if (decoded.exp && decoded.exp < Date.now() / 1000) {
            await BlacklistToken.create({
                token,
                expiresAt: new Date(decoded.exp * 1000),
                userId: decoded.id
            });
            return res.status(401).json({
                success: false,
                error: 'Token expired. Please login again.'
            });
        }
        
        req.userId = decoded.id;
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired. Please login again.'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token. Please login again.'
            });
        }
        return res.status(401).json({
            success: false,
            error: 'Authentication failed.'
        });
    }
};

const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({
            success: false,
            error: 'Access denied. Admin only.'
        });
    }
};

module.exports = { protect, adminOnly };