// backend/routes/templates.js - UPDATED FOR MULTI-STORE
const express = require('express');
const db = require('../db');
const router = express.Router();

// Get all templates FOR CURRENT SHOP
router.get('/', (req, res) => {
    const shop = req.shop; // From verifyShop middleware
    
    db.all('SELECT * FROM email_templates WHERE shop_domain = ? ORDER BY is_default DESC, created_at DESC', [shop], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get template by ID FOR CURRENT SHOP
router.get('/:id', (req, res) => {
    const id = req.params.id;
    const shop = req.shop;
    
    db.get('SELECT * FROM email_templates WHERE id = ? AND shop_domain = ?', [id, shop], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Template not found' });
            return;
        }
        res.json(row);
    });
});

// Create new template FOR CURRENT SHOP
router.post('/', (req, res) => {
    const { name, subject, body_html } = req.body;
    const shop = req.shop;
    
    if (!name || !subject || !body_html) {
        return res.status(400).json({ error: 'Name, subject, and body are required' });
    }
    
    db.run(
        'INSERT INTO email_templates (shop_domain, name, subject, body_html) VALUES (?, ?, ?, ?)',
        [shop, name, subject, body_html],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, message: 'Template created successfully' });
        }
    );
});

// Update template FOR CURRENT SHOP
router.put('/:id', (req, res) => {
    const id = req.params.id;
    const { name, subject, body_html } = req.body;
    const shop = req.shop;
    
    db.run(
        'UPDATE email_templates SET name = ?, subject = ?, body_html = ?, updated_at = datetime("now") WHERE id = ? AND shop_domain = ?',
        [name, subject, body_html, id, shop],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ error: 'Template not found' });
                return;
            }
            res.json({ message: 'Template updated successfully' });
        }
    );
});

// Delete template FOR CURRENT SHOP
router.delete('/:id', (req, res) => {
    const id = req.params.id;
    const shop = req.shop;
    
    // Check if this is the default template
    db.get('SELECT is_default FROM email_templates WHERE id = ? AND shop_domain = ?', [id, shop], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!row) {
            return res.status(404).json({ error: 'Template not found' });
        }
        
        if (row.is_default) {
            return res.status(400).json({ error: 'Cannot delete the default template' });
        }
        
        db.run('DELETE FROM email_templates WHERE id = ? AND shop_domain = ?', [id, shop], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ error: 'Template not found' });
                return;
            }
            res.json({ message: 'Template deleted successfully' });
        });
    });
});

// Set default template FOR CURRENT SHOP
router.post('/:id/set-default', (req, res) => {
    const id = req.params.id;
    const shop = req.shop;
    
    db.serialize(() => {
        // First, remove default from all templates FOR THIS SHOP
        db.run('UPDATE email_templates SET is_default = 0 WHERE shop_domain = ?', [shop]);
        
        // Then set the selected template as default FOR THIS SHOP
        db.run('UPDATE email_templates SET is_default = 1 WHERE id = ? AND shop_domain = ?', [id, shop], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ error: 'Template not found' });
                return;
            }
            res.json({ message: 'Default template updated successfully' });
        });
    });
});

module.exports = router;