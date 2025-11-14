// backend/routes/reminders.js - UPDATED FOR MULTI-STORE
const express = require('express');
const db = require('../db');
const router = express.Router();

// Get all reminders FOR CURRENT SHOP
router.get('/', (req, res) => {
    const shop = req.shop; // From verifyShop middleware
    
    db.all(
        `SELECT r.*, et.name as template_name 
         FROM reminders r 
         LEFT JOIN email_templates et ON r.template_id = et.id 
         WHERE r.shop_domain = ?
         ORDER BY r.created_at DESC`,
        [shop],
        (err, rows) => {
            if (err) {
                console.error('Error fetching reminders:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        }
    );
});

// Create a new reminder FOR CURRENT SHOP
router.post('/', (req, res) => {
    const { draft_order_id, customer_email, customer_name, order_total, due_date, invoice_url, template_id } = req.body;
    const shop = req.shop;

    db.run(
        `INSERT INTO reminders (draft_order_id, customer_email, customer_name, order_total, due_date, invoice_url, template_id, shop_domain) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [draft_order_id, customer_email, customer_name, order_total, due_date, invoice_url, template_id, shop],
        function(err) {
            if (err) {
                console.error('Error creating reminder:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ 
                id: this.lastID, 
                message: 'Reminder created successfully' 
            });
        }
    );
});

// Update a reminder FOR CURRENT SHOP
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const shop = req.shop;
    const { due_date, reminder_sent } = req.body;

    db.run(
        'UPDATE reminders SET due_date = ?, reminder_sent = ? WHERE id = ? AND shop_domain = ?',
        [due_date, reminder_sent, id, shop],
        function(err) {
            if (err) {
                console.error('Error updating reminder:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: 'Reminder updated successfully' });
        }
    );
});

// Delete a reminder FOR CURRENT SHOP
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const shop = req.shop;

    db.run(
        'DELETE FROM reminders WHERE id = ? AND shop_domain = ?',
        [id, shop],
        function(err) {
            if (err) {
                console.error('Error deleting reminder:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: 'Reminder deleted successfully' });
        }
    );
});

module.exports = router;