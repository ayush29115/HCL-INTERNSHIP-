const express = require('express');
const router = express.Router();

// Sample products data (in production, use MongoDB)
const products = [
    { id: 1, name: "iPhone 15 Pro", price: 129999, category: "Smartphones", image: "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=200", rating: 4.8, inStock: true },
    { id: 2, name: "MacBook Pro 16", price: 219999, category: "Laptops", image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=200", rating: 4.7, inStock: true },
    { id: 3, name: "Sony WH-1000XM5", price: 29999, category: "Audio", image: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=200", rating: 4.9, inStock: true },
    { id: 4, name: "Samsung Galaxy S24", price: 119999, category: "Smartphones", image: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=200", rating: 4.6, inStock: true },
    { id: 5, name: "iPad Pro 12.9", price: 89999, category: "Tablets", image: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=200", rating: 4.8, inStock: true },
    { id: 6, name: "Dell XPS 15", price: 189999, category: "Laptops", image: "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=200", rating: 4.5, inStock: true },
    { id: 7, name: "AirPods Pro 2", price: 24999, category: "Audio", image: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=200", rating: 4.8, inStock: true },
    { id: 8, name: "Samsung QN90C", price: 159999, category: "TVs", image: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=200", rating: 4.7, inStock: true }
];

// Get all products
router.get('/products', async (req, res) => {
    try {
        let filteredProducts = [...products];
        const { category, search, minPrice, maxPrice } = req.query;
        
        if (category && category !== 'all') {
            filteredProducts = filteredProducts.filter(p => p.category === category);
        }
        
        if (search) {
            filteredProducts = filteredProducts.filter(p => 
                p.name.toLowerCase().includes(search.toLowerCase())
            );
        }
        
        if (minPrice) {
            filteredProducts = filteredProducts.filter(p => p.price >= parseInt(minPrice));
        }
        
        if (maxPrice) {
            filteredProducts = filteredProducts.filter(p => p.price <= parseInt(maxPrice));
        }
        
        res.json({
            success: true,
            products: filteredProducts,
            total: filteredProducts.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get single product
router.get('/product/:id', async (req, res) => {
    try {
        const product = products.find(p => p.id === parseInt(req.params.id));
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        res.json({
            success: true,
            product
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;