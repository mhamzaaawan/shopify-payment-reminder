// backend/scheduler.js - COMPLETE FIXED VERSION
const cron = require('node-cron');
const db = require('./db');
const axios = require('axios');
require('dotenv').config();

async function checkAndSendReminders() {
    console.log('🔍 Checking for due reminders...');
    
    try {
        // 1. Get schedule settings
        const schedule = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM schedule_settings ORDER BY id DESC LIMIT 1', (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (!schedule) {
            console.log('❌ No schedule settings found');
            return;
        }

        // 2. Check if today is enabled
        const today = new Date().getDay();
        const dayMap = { 
            0: 'sunday', 1: 'monday', 2: 'tuesday', 
            3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' 
        };
        const todayField = dayMap[today];
        
        if (!schedule[todayField]) {
            console.log(`⏭️ Skipping - ${todayField} is disabled in schedule`);
            return;
        }

        // 3. Check if current time matches scheduled time
        const now = new Date();
        const currentTime = now.toTimeString().split(' ')[0].substring(0, 5);
        if (currentTime !== schedule.send_time) {
            console.log(`⏭️ Skipping - current time ${currentTime} doesn't match scheduled time ${schedule.send_time}`);
            return;
        }

        console.log('✅ Schedule matched! Processing reminders...');

        // 4. GET ORDER LIMIT FROM SETTINGS TABLE
        const settings = await new Promise((resolve, reject) => {
            db.get('SELECT order_limit FROM app_settings ORDER BY id DESC LIMIT 1', (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        const orderLimit = settings?.order_limit || 50;
        console.log(`📊 Order limit from settings: ${orderLimit}`);

        // 5. Get ALL templates for template flow
        const templates = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM email_templates ORDER BY id', (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        if (templates.length === 0) {
            console.log('❌ No email templates found');
            return;
        }

        console.log(`📋 Found ${templates.length} templates for template flow`);

        // 6. GET ALL SHOPS (for multi-shop support)
        const shops = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM shops', (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        if (shops.length === 0) {
            console.log('❌ No shops found');
            return;
        }

        let totalSentCount = 0;

        // 7. Process each shop
        for (const shop of shops) {
            console.log(`\n🏪 Processing shop: ${shop.shop_domain}`);
            
            try {
                // ✅ USE BACKEND ROUTE INSTEAD OF DIRECT SHOPIFY API
                const ordersWithEmail = await fetchOrdersFromBackendRoute(shop, orderLimit);
                console.log(`📧 ${ordersWithEmail.length} orders with email found`);

                if (ordersWithEmail.length === 0) {
                    console.log('⏭️ No orders with email found, skipping shop');
                    continue;
                }

                // 8. PROCESS EACH ORDER WITH EMAIL
                let shopSentCount = 0;
                
                for (const order of ordersWithEmail) {
                    try {
                        const customerEmail = order.customer_email;
                        console.log(`\n🔄 Processing order ${order.order_id} - Email: ${customerEmail}`);
                        
                        // Check previous reminders using EMAIL + ORDER ID COMBINATION
                        const previousReminders = await new Promise((resolve, reject) => {
                            db.all(
                                `SELECT * FROM reminders 
                                 WHERE draft_order_id = ? 
                                 AND customer_email = ? 
                                 AND shop_domain = ?`,
                                [order.id, customerEmail, shop.shop_domain],
                                (err, rows) => {
                                    if (err) reject(err);
                                    resolve(rows);
                                }
                            );
                        });

                        // Count only SENT reminders for this specific email + order combination
                        const sentRemindersCount = previousReminders.filter(r => r.reminder_sent === 1).length;
                        const reminderNumber = sentRemindersCount + 1;
                        
                        console.log(`📊 Reminder history for ${order.order_id} + ${customerEmail}:`);
                        console.log(`   - Total reminders in DB: ${previousReminders.length}`);
                        console.log(`   - Already sent: ${sentRemindersCount}`);
                        console.log(`   - This will be reminder #${reminderNumber}`);

                        // SELECT TEMPLATE BASED ON REMINDER COUNT
                        const template = selectTemplateByReminderCount(templates, reminderNumber);
                        console.log(`📝 Using template: "${template.name}"`);

                        // 9. SEND REMINDER EMAIL
                        await sendReminderEmail({
                            shop_domain: shop.shop_domain,
                            access_token: shop.access_token,
                            draft_order_id: order.id,
                            customer_email: customerEmail,
                            customer_name: order.customer_name || 'Customer',
                            order_total: order.total_price,
                            subject: template.subject,
                            body_html: template.body_html,
                            reminder_number: reminderNumber
                        });

                        // 10. SAVE TO DATABASE (Email + Order ID combination)
                        db.run(
                            `INSERT INTO reminders 
                            (draft_order_id, customer_email, customer_name, order_total, due_date, 
                             invoice_url, reminder_sent, sent_at, template_id, shop_domain) 
                            VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), ?, ?)`,
                            [
                                order.id,
                                customerEmail,
                                order.customer_name || 'Customer',
                                order.total_price || '0.00',
                                order.due_date || new Date().toISOString().split('T')[0],
                                order.invoice_url || '',
                                template.id,
                                shop.shop_domain
                            ],
                            function(err) {
                                if (err) {
                                    console.error('❌ Error saving reminder to database:', err);
                                } else {
                                    shopSentCount++;
                                    totalSentCount++;
                                    console.log(`✅ Reminder #${reminderNumber} sent for ${order.order_id}`);
                                    console.log(`   📧 To: ${customerEmail}`);
                                    console.log(`   📝 Template: ${template.name}`);
                                }
                            }
                        );

                        // Small delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 1000));

                    } catch (orderError) {
                        console.error(`❌ Failed to process order ${order.order_id}:`, orderError);
                    }
                }

                console.log(`🎉 Shop ${shop.shop_domain}: Sent ${shopSentCount}/${ordersWithEmail.length} reminders`);

            } catch (shopError) {
                console.error(`❌ Error processing shop ${shop.shop_domain}:`, shopError);
            }
        }

        console.log(`\n🎉 GRAND TOTAL: Successfully sent ${totalSentCount} reminders across all shops!`);

    } catch (error) {
        console.error('❌ Error in scheduler:', error);
    }
}

// FUNCTION: Call your backend route instead of direct Shopify API
async function fetchOrdersFromBackendRoute(shop, limit) {
    try {
        // ✅ CALL THE SAME BACKEND ROUTE THAT FRONTEND USES
        const response = await axios.get(`http://localhost:3000/api/shopify/draft-orders/pending?shop=${shop.shop_domain}`);
        
        if (response.data && response.data.orders) {
            console.log(`✅ Backend route returned ${response.data.orders.length} orders`);
            
            // Apply limit
            const limitedOrders = response.data.orders.slice(0, limit);
            
            // Debug log
            console.log('📋 Orders from backend route:');
            limitedOrders.forEach((order, index) => {
                console.log(`   ${index + 1}. ${order.order_id} - ${order.customer_email}`);
            });
            
            return limitedOrders;
        }
        
        console.log('❌ Backend route returned no orders');
        return [];
        
    } catch (error) {
        console.error('❌ Error calling backend route:', error.message);
        return [];
    }
}

// FUNCTION: Select template based on reminder count
function selectTemplateByReminderCount(templates, reminderNumber) {
    const templateIndex = Math.min(reminderNumber - 1, templates.length - 1);
    return templates[templateIndex];
}

async function sendReminderEmail(reminder) {
    const subject = replaceTemplateVariables(reminder.subject, reminder);
    const body = replaceTemplateVariables(reminder.body_html, reminder);

    try {
        const response = await axios.post(
            `https://${reminder.shop_domain}/admin/api/2024-01/draft_orders/${reminder.draft_order_id}/send_invoice.json`,
            {
                draft_order_invoice: {
                    to: reminder.customer_email,
                    subject: subject,
                    custom_message: body
                }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': reminder.access_token,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data;
    } catch (error) {
        throw new Error(`Shopify API error: ${error.response?.data?.errors || error.message}`);
    }
}

function replaceTemplateVariables(template, reminder) {
    return template
        .replace(/{{order_name}}/g, reminder.draft_order_id || 'N/A')
        .replace(/{{customer_name}}/g, reminder.customer_name || 'Customer')
        .replace(/{{order_total}}/g, reminder.order_total || '0.00')
        .replace(/{{due_date}}/g, reminder.due_date || 'N/A')
        .replace(/{{invoice_url}}/g, reminder.invoice_url || '#')
        .replace(/{{reminder_count}}/g, reminder.reminder_number || '1');
}

// Run every minute to check schedule
cron.schedule('* * * * *', checkAndSendReminders);

console.log('🚀 SMART PAYMENT REMINDER SCHEDULER STARTED!');
console.log('📊 Features: Uses Backend Route + Template Flow + Email+Order Combo Check');
console.log('⏰ Running every minute to check schedule...');