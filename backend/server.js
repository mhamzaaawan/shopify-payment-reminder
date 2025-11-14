require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Import database and Shopify auth
const db = require('./db');
const ShopifyAuth = require('./shopify-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ==================== SHOPIFY AUTH ROUTES (NO PASSWORD PROTECTION) ====================

// Installation route - stores install app from here
app.get('/auth', async (req, res) => {
    const { shop } = req.query;
    
    if (!shop) {
        return res.status(400).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Installation Error</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; text-align: center; }
                    .container { max-width: 500px; margin: 0 auto; }
                    .error { background: #ffe6e6; border: 1px solid #ff4444; padding: 20px; border-radius: 8px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error">
                        <h2>⚠️ Shop Parameter Required</h2>
                        <p>Please provide a shop parameter: /auth?shop=your-store.myshopify.com</p>
                        <p><strong>Installation URL Format:</strong><br>
                        https://your-app-domain.com/auth?shop=your-store.myshopify.com</p>
                    </div>
                </div>
            </body>
            </html>
        `);
    }

    try {
        // Check if shop is already installed
        const isInstalled = await ShopifyAuth.isShopInstalled(shop);
        
        if (isInstalled) {
            // Redirect to app main page if already installed
            return res.redirect(`/?shop=${shop}`);
        }

        // Generate installation URL
        const installUrl = ShopifyAuth.getInstallUrl(
            shop, 
            process.env.SHOPIFY_API_KEY, 
            process.env.HOST || `http://localhost:${PORT}`
        );
        
        console.log(`🔗 Redirecting ${shop} to install URL`);
        res.redirect(installUrl);
        
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).send('Installation failed');
    }
});

// OAuth callback route - Shopify redirects here after installation
app.get('/auth/callback', async (req, res) => {
    const { shop, code, hmac, state } = req.query;
    
    console.log(`🔄 OAuth callback for shop: ${shop}`);
    
    try {
        // Verify HMAC
        if (!ShopifyAuth.verifyHmac(req.query)) {
            return res.status(400).send('Invalid HMAC verification');
        }

        // Get access token
        const accessToken = await ShopifyAuth.getAccessToken(shop, code);
        
        // Save shop to database
        await ShopifyAuth.saveShop(shop, accessToken);
        
        // Create default settings for this shop
        await ShopifyAuth.createDefaultSettings(shop);
        
        console.log(`✅ Successfully installed app for ${shop}`);
        
        // Redirect to app main page
        res.redirect(`/?shop=${shop}`);
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).send('Installation failed');
    }
});

// ==================== MIDDLEWARE: SHOP VERIFICATION ====================

// Middleware to verify shop and get access token
const verifyShop = async (req, res, next) => {
    try {
        // Get shop from query parameter or headers
        const shop = req.query.shop || req.headers['x-shopify-shop-domain'];
        
        if (!shop) {
            return res.status(401).json({ 
                error: 'Shop parameter required. Access app through Shopify admin.' 
            });
        }

        // Check if shop is installed
        const shopData = await ShopifyAuth.getShop(shop);
        if (!shopData || !shopData.access_token) {
            return res.status(401).json({ 
                error: 'App not installed for this shop. Please install first.',
                installUrl: `/auth?shop=${shop}`
            });
        }

        // Add shop info to request
        req.shop = shop;
        req.accessToken = shopData.access_token;
        req.shopData = shopData;
        
        next();
    } catch (error) {
        console.error('Shop verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ==================== FRONTEND ROUTES WITH SHOP VERIFICATION ====================

// Serve frontend pages with shop verification
app.get('/', verifyShop, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/templates', verifyShop, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/templates.html'));
});

app.get('/schedule', verifyShop, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/schedule.html'));
});

app.get('/settings', verifyShop, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/settings.html'));
});

// ==================== API ROUTES ====================

// Your existing API routes
let shopifyRoutes, templateRoutes, scheduleRoutes, settingsRoutes, reminderRoutes;

try {
  shopifyRoutes = require('../lib/shopify');
  if (typeof shopifyRoutes === 'function') {
    app.use('/api/shopify', verifyShop, shopifyRoutes);
    console.log('✅ Shopify routes mounted successfully');
  }
} catch (error) {
  console.log('❌ Error loading shopify routes:', error.message);
}

try {
  templateRoutes = require('./routes/templates');
  if (typeof templateRoutes === 'function') {
    app.use('/api/templates', verifyShop, templateRoutes);
    console.log('✅ Template routes mounted successfully');
  }
} catch (error) {
  console.log('❌ Error loading template routes:', error.message);
}

try {
  scheduleRoutes = require('./routes/schedule');
  if (typeof scheduleRoutes === 'function') {
    app.use('/api/schedule', verifyShop, scheduleRoutes);
    console.log('✅ Schedule routes mounted successfully');
  }
} catch (error) {
  console.log('❌ Error loading schedule routes:', error.message);
}

try {
  settingsRoutes = require('./routes/settings');
  if (typeof settingsRoutes === 'function') {
    app.use('/api/settings', verifyShop, settingsRoutes);
    console.log('✅ Settings routes mounted successfully');
  }
} catch (error) {
  console.log('❌ Error loading settings routes:', error.message);
}

try {
  reminderRoutes = require('./routes/reminders');
  if (typeof reminderRoutes === 'function') {
    app.use('/api/reminders', verifyShop, reminderRoutes);
    console.log('✅ Reminder routes mounted successfully');
  }
} catch (error) {
  console.log('❌ Error loading reminder routes:', error.message);
}

// ==================== OTHER ROUTES ====================

// WEBHOOK ROUTE
app.post('/', (req, res) => {
  console.log('✅ Webhook received:', req.body);
  console.log('✅ Headers:', req.headers);
  
  res.status(200).json({ 
    success: true, 
    message: 'Webhook received successfully' 
  });
});

// Installation success page
app.get('/install-success', (req, res) => {
    const { shop } = req.query;
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Installation Successful</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; text-align: center; }
                .success { background: #e6ffe6; border: 1px solid #44ff44; padding: 30px; border-radius: 8px; max-width: 500px; margin: 0 auto; }
            </style>
        </head>
        <body>
            <div class="success">
                <h2>✅ Installation Successful!</h2>
                <p>Your app has been successfully installed for <strong>${shop}</strong></p>
                <p><a href="/?shop=${shop}">Open App Dashboard</a></p>
            </div>
        </body>
        </html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`📝 Templates: http://localhost:${PORT}/templates`);
    console.log(`⏰ Schedule: http://localhost:${PORT}/schedule`);
    console.log(`⚙️ Settings: http://localhost:${PORT}/settings`);
    console.log(`🔐 Direct Install: http://localhost:${PORT}/auth?shop=your-store.myshopify.com`);
});

// Start scheduler
require('./scheduler');