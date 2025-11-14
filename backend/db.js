// backend/db.js - COMPLETELY FIXED VERSION
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'reminders.db');
console.log('🔍 [DB.JS] Database path:', dbPath);
console.log('🔍 [DB.JS] DB_PATH from env:', process.env.DB_PATH);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    // Create tables
    db.serialize(() => {
        // Reminders table
        db.run(`CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draft_order_id TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            customer_name TEXT,
            order_total REAL,
            due_date TEXT,
            invoice_url TEXT,
            reminder_sent INTEGER DEFAULT 0,
            sent_at TEXT,
            template_id INTEGER,
            shop_domain TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Shops table - UPDATED VERSION (ONLY ONE TABLE)
        db.run(`CREATE TABLE IF NOT EXISTS shops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_domain TEXT UNIQUE NOT NULL,
            access_token TEXT,
            plan_type TEXT DEFAULT 'basic',
            settings TEXT DEFAULT '{}',
            installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            uninstalled_at DATETIME NULL
        )`);

        // Email templates table - UPDATED VERSION
        db.run(`CREATE TABLE IF NOT EXISTS email_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_domain TEXT NOT NULL,
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            body_html TEXT NOT NULL,
            is_default INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Schedule settings table - UPDATED VERSION
        db.run(`CREATE TABLE IF NOT EXISTS schedule_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_domain TEXT UNIQUE NOT NULL,
            monday INTEGER DEFAULT 1,
            tuesday INTEGER DEFAULT 1,
            wednesday INTEGER DEFAULT 1,
            thursday INTEGER DEFAULT 1,
            friday INTEGER DEFAULT 1,
            saturday INTEGER DEFAULT 1,
            sunday INTEGER DEFAULT 1,
            send_time TIME DEFAULT '09:00',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Settings table for app configuration - UPDATED VERSION
        db.run(`CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_domain TEXT UNIQUE NOT NULL,
            order_limit INTEGER DEFAULT 50,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Insert default order limit
        db.run('INSERT OR IGNORE INTO app_settings (shop_domain, order_limit) VALUES ("default", 50)');

        // Insert default template
        db.get('SELECT COUNT(*) as count FROM email_templates', (err, row) => {
            if (err) {
                console.error('Error checking templates:', err.message);
                return;
            }

            if (row && row.count === 0) {
                const defaultTemplateBody =
                    '<!DOCTYPE html>' +
                    '<html>' +
                    '<head>' +
                    '<style>' +
                    'body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }' +
                    '.container { max-width: 600px; margin: 0 auto; padding: 20px; }' +
                    '.header { background: #2c5aa0; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }' +
                    '.content { padding: 30px; background: #f9f9f9; border-radius: 0 0 8px 8px; }' +
                    '.footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }' +
                    '.button { background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 10px 0; }' +
                    '.order-details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #2c5aa0; }' +
                    '</style>' +
                    '</head>' +
                    '<body>' +
                    '<div class="container">' +
                    '<div class="header">' +
                    '<h1>Payment Reminder</h1>' +
                    '</div>' +
                    '<div class="content">' +
                    '<p>Hello <strong>{{customer_name}}</strong>,</p>' +
                    '<p>This is a friendly reminder that your payment for order <strong>{{order_name}}</strong> is due.</p>' +
                    '<div class="order-details">' +
                    '<p><strong>Order Number:</strong> {{order_name}}</p>' +
                    '<p><strong>Amount Due:</strong> ${{order_total}}</p>' +
                    '<p><strong>Due Date:</strong> {{due_date}}</p>' +
                    '</div>' +
                    '<p>Please complete your payment using the link below:</p>' +
                    '<div style="text-align: center;">' +
                    '<a href="{{invoice_url}}" class="button">Pay Now</a>' +
                    '</div>' +
                    '<p>If you have already made the payment, please disregard this message.</p>' +
                    '<p>Thank you for your business!</p>' +
                    '</div>' +
                    '<div class="footer">' +
                    '<p>If you have any questions, please contact our support team.</p>' +
                    '<p>This is an automated reminder. Please do not reply to this email.</p>' +
                    '</div>' +
                    '</div>' +
                    '</body>' +
                    '</html>';

                db.run(
                    'INSERT INTO email_templates (shop_domain, name, subject, body_html, is_default) VALUES (?, ?, ?, ?, ?)',
                    ['default', 'Default Payment Reminder', 'Payment Reminder for Your Order {{order_name}}', defaultTemplateBody, 1],
                    function (err) {
                        if (err) {
                            console.error('Error creating default template:', err.message);
                        } else {
                            console.log('Default template created successfully');
                        }
                    }
                );
            }
        });

        // Insert default schedule settings
        db.get('SELECT COUNT(*) as count FROM schedule_settings', (err, row) => {
            if (err) {
                console.error('Error checking schedule:', err.message);
                return;
            }

            if (row && row.count === 0) {
                db.run(
                    'INSERT INTO schedule_settings (shop_domain, monday, tuesday, wednesday, thursday, friday, saturday, sunday, send_time) VALUES (?, 1, 1, 1, 1, 1, 1, 1, "09:00")',
                    ['default'],
                    function (err) {
                        if (err) {
                            console.error('Error creating default schedule:', err.message);
                        } else {
                            console.log('Default schedule settings created');
                        }
                    }
                );
            }
        });
    });

    console.log('Database tables initialized');
}

module.exports = db;