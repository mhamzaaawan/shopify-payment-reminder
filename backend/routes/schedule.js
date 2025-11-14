// backend/routes/schedule.js - UPDATED FOR MULTI-STORE
const express = require('express');
const db = require('../db');
const router = express.Router();

// Get schedule settings FOR CURRENT SHOP
router.get('/', (req, res) => {
    const shop = req.shop; // From verifyShop middleware
    
    db.get('SELECT * FROM schedule_settings WHERE shop_domain = ?', [shop], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row || {});
    });
});

// Update schedule settings FOR CURRENT SHOP
router.put('/', (req, res) => {
    const { 
        monday, tuesday, wednesday, thursday, friday, saturday, sunday, send_time 
    } = req.body;
    const shop = req.shop;
    
    db.run(
        `INSERT OR REPLACE INTO schedule_settings 
        (shop_domain, monday, tuesday, wednesday, thursday, friday, saturday, sunday, send_time) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [shop, monday, tuesday, wednesday, thursday, friday, saturday, sunday, send_time],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: 'Schedule settings updated successfully' });
        }
    );
});

module.exports = router;