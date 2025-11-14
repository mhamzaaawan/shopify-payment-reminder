// backend/routes/settings.js - UPDATED FOR MULTI-STORE
const express = require('express');
const db = require('../db');
const router = express.Router();

// Get app settings FOR CURRENT SHOP
router.get('/', (req, res) => {
    const shop = req.shop; // From verifyShop middleware
    
    db.get('SELECT * FROM app_settings WHERE shop_domain = ?', [shop], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row || { order_limit: 50 });
    });
});

// Update app settings FOR CURRENT SHOP
router.put('/', (req, res) => {
    const { order_limit } = req.body;
    const shop = req.shop;
    
    if (!order_limit || order_limit < 1 || order_limit > 1000) {
        return res.status(400).json({ error: 'Order limit must be between 1 and 1000' });
    }
    
    db.run(
        `INSERT OR REPLACE INTO app_settings 
        (shop_domain, order_limit) 
        VALUES (?, ?)`,
        [shop, order_limit],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: 'Settings updated successfully', order_limit });
        }
    );
});

module.exports = router;