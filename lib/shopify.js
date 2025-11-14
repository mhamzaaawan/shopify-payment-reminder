// lib/shopify.js - UPDATED FOR MULTI-STORE
const express = require('express');
const axios = require('axios');
const db = require('../backend/db');
const router = express.Router();

const SHOPIFY_API_VERSION = '2025-01';

// Get draft orders with status "invoice_sent" - UPDATED FOR MULTI-STORE
router.get('/draft-orders/pending', async (req, res) => {
    const shop = req.shop; // From verifyShop middleware
    
    console.log('🔍 [DEBUG] Starting draft orders fetch for shop:', shop);

    try {
        // Get shop access token from req (already verified by middleware)
        const accessToken = req.accessToken;

        // Get order limit from settings FOR THIS SHOP
        let orderLimit = 250;
        try {
            const settings = await new Promise((resolve, reject) => {
                db.get('SELECT order_limit FROM app_settings WHERE shop_domain = ?', [shop], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });
            orderLimit = settings?.order_limit || 250;
        } catch (error) {
            console.log('⚠️ [DEBUG] Using default order limit 250');
        }

        console.log('📊 [DEBUG] Order limit:', orderLimit);

        // PAGINATION: Fetch ALL draft orders
        let allDraftOrders = [];
        let pageInfo = null;
        let page = 1;

        do {
            let url;
            if (pageInfo) {
                url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/draft_orders.json?page_info=${pageInfo}`;
            } else {
                url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/draft_orders.json?status=invoice_sent&limit=250`;
            }

            console.log(`📄 [DEBUG] Fetching page ${page}...`);

            const response = await axios.get(url, {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            });

            const pageOrders = response.data.draft_orders || [];
            allDraftOrders = allDraftOrders.concat(pageOrders);
            console.log(`✅ [DEBUG] Page ${page}: Got ${pageOrders.length} orders`);

            // Check for next page
            const linkHeader = response.headers.link;
            if (linkHeader && linkHeader.includes('rel="next"')) {
                const nextPageMatch = linkHeader.match(/page_info=([^>]+)>; rel="next"/);
                pageInfo = nextPageMatch ? nextPageMatch[1] : null;
            } else {
                pageInfo = null;
            }

            page++;
            if (page > 10) break; // Safety limit

        } while (pageInfo);

        console.log(`✅ [DEBUG] Total orders fetched: ${allDraftOrders.length}`);

        // Sort by latest created first
        const sortedDraftOrders = allDraftOrders.sort((a, b) => {
            return new Date(b.created_at) - new Date(a.created_at);
        });

        // Apply user limit
        const limitedDraftOrders = sortedDraftOrders.slice(0, orderLimit);

        // Process and filter orders
        const pendingDraftOrders = [];
        
        limitedDraftOrders.forEach(draftOrder => {
            const notes = draftOrder.note || '';
            const extractedData = extractFromNotes(notes);
            const hasEmail = extractedData.email || (draftOrder.customer && draftOrder.customer.email);
            const hasValidStatus = draftOrder.status === 'invoice_sent';
            
            if (hasValidStatus && hasEmail) {
                const email = extractedData.email || (draftOrder.customer ? draftOrder.customer.email : null);
                const name = extractedData.name || 
                           (draftOrder.customer ? `${draftOrder.customer.first_name} ${draftOrder.customer.last_name}`.trim() : 'Customer');

                pendingDraftOrders.push({
                    id: draftOrder.id,
                    name: draftOrder.name,
                    order_id: draftOrder.name || `DRAFT-${draftOrder.id}`,
                    customer_email: email,
                    customer_name: name,
                    total_price: draftOrder.total_price,
                    created_at: draftOrder.created_at,
                    note: notes,
                    status: draftOrder.status,
                    invoice_url: draftOrder.invoice_url,
                    due_date: new Date().toISOString().split('T')[0] // TODAY'S DATE
                });

                console.log(`✅ [DEBUG] INCLUDED: ${draftOrder.name} - ${email}`);
            }
        });

        console.log('🎯 [DEBUG] Final count:', {
            totalFetched: allDraftOrders.length,
            totalProcessed: pendingDraftOrders.length,
            orders: pendingDraftOrders.map(o => o.order_id)
        });

        res.json({
            orders: pendingDraftOrders,
            total_fetched: allDraftOrders.length,
            total_processed: pendingDraftOrders.length,
            order_limit: orderLimit
        });

    } catch (error) {
        console.error('❌ [DEBUG] Error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to fetch draft orders',
            details: error.response?.data?.errors || error.message 
        });
    }
});

// Send reminder email - UPDATED FOR MULTI-STORE
router.post('/send-reminder', async (req, res) => {
    const { draft_order_id, customer_email, customer_name, order_total, order_name, invoice_url } = req.body;
    const shop = req.shop;

    try {
        const accessToken = req.accessToken;

        // Get email templates FOR THIS SHOP
        const templates = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM email_templates WHERE shop_domain = ? ORDER BY id', [shop], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        if (templates.length === 0) {
            return res.status(404).json({ error: 'No email templates found' });
        }

        // Get last used template for rotation FOR THIS SHOP
        const lastReminder = await new Promise((resolve, reject) => {
            db.get('SELECT template_id FROM reminders WHERE shop_domain = ? ORDER BY id DESC LIMIT 1', [shop], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        let nextTemplate;
        if (lastReminder && lastReminder.template_id) {
            const lastIndex = templates.findIndex(t => t.id === lastReminder.template_id);
            nextTemplate = templates[(lastIndex + 1) % templates.length];
        } else {
            nextTemplate = templates[0];
        }

        // Replace template variables - USE TODAY'S DATE
        const today = new Date().toLocaleDateString();
        const todayDate = new Date().toISOString().split('T')[0];
        
        const subject = replaceTemplateVariables(nextTemplate.subject, {
            order_name: order_name,
            customer_name: customer_name,
            order_total: order_total,
            due_date: today
        });

        const body = replaceTemplateVariables(nextTemplate.body_html, {
            order_name: order_name,
            customer_name: customer_name,
            order_total: order_total,
            due_date: today,
            invoice_url: invoice_url
        });

        // Send email via Shopify
        await sendPaymentReminderEmail(
            shop, 
            accessToken, 
            customer_email, 
            subject, 
            body,
            draft_order_id
        );

        // Save to database - USE TODAY'S DATE
        db.run(
            `INSERT INTO reminders (draft_order_id, customer_email, customer_name, order_total, due_date, invoice_url, template_id, shop_domain) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [draft_order_id, customer_email, customer_name, order_total, todayDate, invoice_url, nextTemplate.id, shop],
            function(err) {
                if (err) {
                    console.error('Error saving reminder:', err);
                } else {
                    console.log(`✅ Reminder saved with ID: ${this.lastID}, Shop: ${shop}, Due Date: ${todayDate}`);
                }
            }
        );

        res.json({ 
            success: true, 
            message: 'Reminder sent successfully',
            template_used: nextTemplate.name,
            email_sent: customer_email
        });

    } catch (error) {
        console.error('Error sending reminder:', error);
        res.status(500).json({ 
            error: 'Failed to send reminder',
            details: error.message 
        });
    }
});

// Email sending function (same as before)
async function sendPaymentReminderEmail(shop, accessToken, to, subject, body, draftOrderId) {
    try {
        const response = await axios.post(
            `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/draft_orders/${draftOrderId}/send_invoice.json`,
            {
                draft_order_invoice: {
                    to: to,
                    subject: subject,
                    custom_message: body
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error('Failed to send email:', error.response?.data || error.message);
        throw new Error('Email sending failed');
    }
}

// Email extraction function (same as before)
function extractFromNotes(notes) {
    if (!notes || notes === 'null' || notes === '') {
        return { name: '', email: '' };
    }
    
    // Look for email pattern
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = notes.match(emailRegex);
    const email = emails ? emails[0] : null;
    
    if (!email) {
        return { name: '', email: '' };
    }

    // Extract name from text before email
    let name = '';
    const emailIndex = notes.indexOf(email);
    if (emailIndex > 0) {
        name = notes.substring(0, emailIndex).trim();
        // Clean up name
        name = name.replace(/[,\.\s]*$/, '');
    }

    // If no name found, try to extract from common patterns
    if (!name) {
        const nameMatch = notes.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        if (nameMatch) name = nameMatch[1];
    }

    return { 
        name: name || 'Customer', 
        email: email 
    };
}

// Template variable replacement (same as before)
function replaceTemplateVariables(template, data) {
    return template
        .replace(/{{order_name}}/g, data.order_name || '')
        .replace(/{{customer_name}}/g, data.customer_name || '')
        .replace(/{{order_total}}/g, data.order_total || '')
        .replace(/{{due_date}}/g, data.due_date || '')
        .replace(/{{invoice_url}}/g, data.invoice_url || '');
}

module.exports = router;