// backend/shopify-auth.js
const db = require('./db');
const crypto = require('crypto');

class ShopifyAuth {
    // Generate installation URL for a shop
    static getInstallUrl(shop, apiKey, host, scopes = 'read_draft_orders,write_draft_orders') {
        const nonce = crypto.randomBytes(16).toString('hex');
        const redirectUri = `${host}/auth/callback`;
        
        const installUrl = `https://${shop}/admin/oauth/authorize?` +
            `client_id=${apiKey}&` +
            `scope=${scopes}&` +
            `redirect_uri=${redirectUri}&` +
            `state=${nonce}`;
            
        return installUrl;
    }

    // Verify HMAC signature from Shopify
    static verifyHmac(query) {
        const { hmac, ...rest } = query;
        if (!hmac) return false;

        const message = new URLSearchParams(rest).toString();
        const generatedHmac = crypto
            .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
            .update(message)
            .digest('hex');

        return generatedHmac === hmac;
    }

    // Exchange code for access token
    static async getAccessToken(shop, code) {
        try {
            const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    client_id: process.env.SHOPIFY_API_KEY,
                    client_secret: process.env.SHOPIFY_API_SECRET,
                    code,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.access_token;
        } catch (error) {
            console.error('Error getting access token:', error);
            throw error;
        }
    }

    // Save shop data to database
    static async saveShop(shopDomain, accessToken) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT OR REPLACE INTO shops (shop_domain, access_token, installed_at) 
                VALUES (?, ?, datetime('now'))
            `;
            
            db.run(query, [shopDomain, accessToken], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // Get shop by domain
    static async getShop(shopDomain) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM shops WHERE shop_domain = ?', [shopDomain], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Check if shop is installed
    static async isShopInstalled(shopDomain) {
        const shop = await this.getShop(shopDomain);
        return !!shop && !!shop.access_token;
    }

    // Create default settings for new shop
    static async createDefaultSettings(shopDomain) {
        return new Promise((resolve, reject) => {
            // Create default app settings
            db.run(
                'INSERT OR IGNORE INTO app_settings (shop_domain, order_limit) VALUES (?, ?)',
                [shopDomain, 50],
                (err) => {
                    if (err) {
                        console.error('Error creating app settings:', err);
                        reject(err);
                        return;
                    }

                    // Create default schedule settings
                    db.run(
                        'INSERT OR IGNORE INTO schedule_settings (shop_domain, monday, tuesday, wednesday, thursday, friday, saturday, sunday, send_time) VALUES (?, 1, 1, 1, 1, 1, 1, 1, "09:00")',
                        [shopDomain],
                        (err) => {
                            if (err) {
                                console.error('Error creating schedule settings:', err);
                                reject(err);
                                return;
                            }

                            // Create default template for this shop
                            const defaultTemplateBody = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c5aa0; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        .button { background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 10px 0; }
        .order-details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #2c5aa0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Payment Reminder</h1>
        </div>
        <div class="content">
            <p>Hello <strong>{{customer_name}}</strong>,</p>
            <p>This is a friendly reminder that your payment for order <strong>{{order_name}}</strong> is due.</p>
            <div class="order-details">
                <p><strong>Order Number:</strong> {{order_name}}</p>
                <p><strong>Amount Due:</strong> ${{order_total}}</p>
                <p><strong>Due Date:</strong> {{due_date}}</p>
            </div>
            <p>Please complete your payment using the link below:</p>
            <div style="text-align: center;">
                <a href="{{invoice_url}}" class="button">Pay Now</a>
            </div>
            <p>If you have already made the payment, please disregard this message.</p>
            <p>Thank you for your business!</p>
        </div>
        <div class="footer">
            <p>If you have any questions, please contact our support team.</p>
            <p>This is an automated reminder. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>`;

                            db.run(
                                'INSERT INTO email_templates (shop_domain, name, subject, body_html, is_default) VALUES (?, ?, ?, ?, ?)',
                                [shopDomain, 'Default Payment Reminder', 'Payment Reminder for Your Order {{order_name}}', defaultTemplateBody, 1],
                                (err) => {
                                    if (err) {
                                        console.error('Error creating default template:', err);
                                        reject(err);
                                        return;
                                    }
                                    resolve(true);
                                }
                            );
                        }
                    );
                }
            );
        });
    }
}

module.exports = ShopifyAuth;