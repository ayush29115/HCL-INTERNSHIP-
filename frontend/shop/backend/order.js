const express = require('express');
const Order = require('Order');
const Product = require('Product');
const User = require('User');
const { protect } = require('auth');

const router = express.Router();

// Create order
router.post('/', protect, async (req, res) => {
    try {
        const { items, shippingAddress, paymentMethod, totalAmount } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Cart is empty'
            });
        }
        
        const order = await Order.create({
            orderNumber: 'REPTO-' + Date.now(),
            user: req.userId,
            items,
            subtotal: totalAmount * 0.82,
            tax: totalAmount * 0.18,
            shipping: totalAmount > 50000 ? 0 : 99,
            totalAmount,
            paymentMethod: paymentMethod || 'Online',
            status: 'Confirmed',
            shippingAddress
        });
        
        // Update user coins
        const user = await User.findById(req.userId);
        user.reptoCoins += Math.floor(totalAmount / 100);
        await user.save();
        
        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            order
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get user orders
router.get('/my-orders', protect, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.userId })
            .sort('-createdAt');
        
        res.json({
            success: true,
            orders
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get single order
router.get('/:orderId', protect, async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.orderId,
            user: req.userId
        });
        
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            order
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cancel order
router.put('/:orderId/cancel', protect, async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.orderId,
            user: req.userId
        });
        
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
        
        if (order.status !== 'Confirmed') {
            return res.status(400).json({
                success: false,
                error: 'Order cannot be cancelled'
            });
        }
        
        order.status = 'Cancelled';
        await order.save();
        
        res.json({
            success: true,
            message: 'Order cancelled successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;