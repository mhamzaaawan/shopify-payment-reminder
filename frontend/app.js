// frontend/app.js - UPDATED FOR MULTI-STORE
let currentStats = {
    totalReminders: 0,
    sentReminders: 0,
    pendingReminders: 0,
    totalTemplates: 0
};

// Get shop domain from URL parameters
function getShopDomain() {
    const urlParams = new URLSearchParams(window.location.search);
    let shop = urlParams.get('shop');
    
    // If not in URL, try to get from referrer (for embedded apps)
    if (!shop) {
        const referrer = document.referrer;
        if (referrer && referrer.includes('.myshopify.com')) {
            const match = referrer.match(/https:\/\/([a-zA-Z0-9-]+\.myshopify\.com)/);
            if (match) {
                shop = match[1];
            }
        }
    }
    
    console.log('🔍 [FRONTEND] Current shop domain:', shop);
    return shop;
}

// Add shop parameter to all fetch requests
function addShopToFetch() {
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        // Add shop parameter to API calls
        if (typeof url === 'string' && url.startsWith('/api/')) {
            const shop = getShopDomain();
            if (shop) {
                if (url.includes('?')) {
                    url += `&shop=${shop}`;
                } else {
                    url += `?shop=${shop}`;
                }
            }
        }
        return originalFetch(url, options);
    };
}

document.addEventListener('DOMContentLoaded', function() {
    addShopToFetch(); // Add shop to all API calls
    loadStats();
    loadReminders();
    
    // Check if shop is available
    const shop = getShopDomain();
    if (!shop) {
        showShopRequiredMessage();
    }
});

// Show shop required message
function showShopRequiredMessage() {
    const mainContent = document.querySelector('.dashboard-stats, .main-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div class="error" style="text-align: center; padding: 40px;">
                <h2>⚠️ Shop Access Required</h2>
                <p>Please access this app through your Shopify admin panel.</p>
                <p><strong>Installation URL:</strong></p>
                <p><code style="background: #f4f4f4; padding: 10px; border-radius: 4px;">
                    https://your-app-domain.com/auth?shop=your-store.myshopify.com
                </code></p>
                <p>Or contact support for installation assistance.</p>
            </div>
        `;
    }
}

// Load dashboard statistics
async function loadStats() {
    try {
        const shop = getShopDomain();
        if (!shop) return;
        
        // Load reminders count
        const remindersResponse = await fetch(`/api/reminders`);
        const reminders = await remindersResponse.json();
        
        // Load templates count
        const templatesResponse = await fetch('/api/templates');
        const templates = await templatesResponse.json();
        
        currentStats = {
            totalReminders: reminders.length,
            sentReminders: reminders.filter(r => r.reminder_sent).length,
            pendingReminders: reminders.filter(r => !r.reminder_sent).length,
            totalTemplates: templates.length
        };
        
        updateStatsDisplay();
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function updateStatsDisplay() {
    const totalEl = document.getElementById('totalReminders');
    const sentEl = document.getElementById('sentReminders');
    const pendingEl = document.getElementById('pendingReminders');
    const templatesEl = document.getElementById('totalTemplates');
    
    if (totalEl) totalEl.textContent = currentStats.totalReminders;
    if (sentEl) sentEl.textContent = currentStats.sentReminders;
    if (pendingEl) pendingEl.textContent = currentStats.pendingReminders;
    if (templatesEl) templatesEl.textContent = currentStats.totalTemplates;
}

// Install Shopify app - UPDATED FOR MULTI-STORE
function installApp() {
    const shopDomain = document.getElementById('shopDomain')?.value;
    if (!shopDomain) {
        alert('Please enter your Shopify store domain');
        return;
    }
    
    // Validate shop domain format
    if (!shopDomain.includes('.myshopify.com')) {
        alert('Please enter a valid Shopify domain (e.g., your-store.myshopify.com)');
        return;
    }
    
    // Use new auth endpoint
    window.location.href = `/auth?shop=${shopDomain}`;
}

// Load pending draft orders from Shopify - UPDATED FOR MULTI-STORE
async function loadPendingDraftOrders() {
    const shopDomain = getShopDomain();
    console.log('🔍 [DEBUG] Loading orders for shop:', shopDomain);
    
    if (!shopDomain) {
        alert('Shop domain not found. Please access the app through Shopify admin.');
        return;
    }

    const ordersList = document.getElementById('ordersList');
    if (!ordersList) return;
    
    ordersList.innerHTML = '<div class="loading">🔄 Loading draft orders...</div>';

    try {
        const response = await fetch(`/api/shopify/draft-orders/pending`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch draft orders');
        }
        
        const result = await response.json();
        const draftOrders = result.orders || [];
        
        if (draftOrders.length === 0) {
            ordersList.innerHTML = `
                <div class="warning">
                    <strong>No pending draft orders found.</strong><br>
                    Make sure you have draft orders with status "invoice_sent" or "incomplete" that contain customer emails in the notes.
                </div>
            `;
            return;
        }

        ordersList.innerHTML = `
            <h3>📋 Found ${draftOrders.length} Pending Draft Orders</h3>
            <div class="info-text">
                📊 Showing ${draftOrders.length} of ${result.total_fetched || draftOrders.length} fetched orders 
                ${result.order_limit ? `(Limit: ${result.order_limit} orders)` : ''} • 
                <a href="/settings" style="color: #2c5aa0;">Change Limit</a>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Order #</th>
                            <th>Customer</th>
                            <th>Email</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th>Notes Preview</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${draftOrders.map(order => `
                            <tr>
                                <td><strong>${order.order_id}</strong></td>
                                <td>${order.customer_name}</td>
                                <td>${order.customer_email}</td>
                                <td>$${order.total_price}</td>
                                <td><span class="status pending">${order.status}</span></td>
                                <td class="notes-cell" title="${order.note || 'No notes'}">
                                    ${order.note ? order.note.substring(0, 50) + (order.note.length > 50 ? '...' : '') : 'No notes'}
                                </td>
                                <td>
                                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                                        <button class="btn btn-success btn-sm" onclick="sendImmediateReminder(${JSON.stringify(order).replace(/"/g, '&quot;')})">
                                            📧 Send Now
                                        </button>
                                        <button class="btn btn-primary btn-sm" onclick="viewOrderDetails(${JSON.stringify(order).replace(/"/g, '&quot;')})">
                                            👁️ View
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading draft orders:', error);
        ordersList.innerHTML = `
            <div class="error">
                <strong>Error loading draft orders:</strong><br>
                ${error.message}<br>
                Make sure the app is installed for this store and you have the correct permissions.
            </div>
        `;
    }
}

// Send immediate reminder for draft order - UPDATED FOR MULTI-STORE
async function sendImmediateReminder(order) {
    if (!confirm(`Send payment reminder to ${order.customer_name} (${order.customer_email}) for order ${order.order_id}?`)) {
        return;
    }

    try {
        const shopDomain = getShopDomain();
        const response = await fetch('/api/shopify/send-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                draft_order_id: order.id,
                customer_email: order.customer_email,
                customer_name: order.customer_name,
                order_total: order.total_price,
                order_name: order.order_id,
                invoice_url: order.invoice_url
                // shop parameter automatically added by addShopToFetch()
            })
        });

        const result = await response.json();

        if (response.ok) {
            alert(`✅ Reminder sent successfully!\nTemplate used: ${result.template_used}`);
            loadReminders();
            loadStats();
        } else {
            alert(`❌ Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error sending reminder:', error);
        alert('❌ Error sending reminder. Please try again.');
    }
}

// View order details
function viewOrderDetails(order) {
    const details = `
Order ID: ${order.order_id}
Customer: ${order.customer_name}
Email: ${order.customer_email}
Total: $${order.total_price}
Status: ${order.status}
Due Date: ${new Date(order.due_date).toLocaleDateString()}
Invoice URL: ${order.invoice_url}
Notes: ${order.note || 'No notes'}
    `;
    
    alert(details);
}

// Load scheduled reminders - UPDATED FOR MULTI-STORE
async function loadReminders() {
    try {
        const response = await fetch(`/api/reminders`);
        const reminders = await response.json();
        
        const tbody = document.getElementById('remindersBody');
        if (!tbody) return;
        
        if (reminders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading">
                        No reminders sent yet. Send your first reminder from the draft orders above.
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = reminders.map(reminder => `
            <tr>
                <td><strong>${reminder.draft_order_id}</strong></td>
                <td>
                    <strong>${reminder.customer_name}</strong><br>
                    <small>${reminder.customer_email}</small>
                </td>
                <td>$${reminder.order_total}</td>
                <td>${new Date(reminder.due_date).toLocaleDateString()}</td>
                <td>${reminder.template_name || 'Default'}</td>
                <td>
                    <span class="status ${reminder.reminder_sent ? 'sent' : 'pending'}">
                        ${reminder.reminder_sent ? '✅ Sent' : '⏳ Pending'}
                    </span>
                </td>
                <td>${reminder.sent_at ? new Date(reminder.sent_at).toLocaleDateString() : '-'}</td>
            </tr>
        `).join('');
        
        loadStats(); // Refresh stats after loading reminders
    } catch (error) {
        console.error('Error loading reminders:', error);
        const tbody = document.getElementById('remindersBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="error">
                        Error loading reminders: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

// NEW: Check if app is installed for current shop
async function checkAppInstallation() {
    try {
        const shop = getShopDomain();
        if (!shop) return false;
        
        const response = await fetch('/api/shopify/draft-orders/pending');
        return response.ok;
    } catch (error) {
        return false;
    }
}

// NEW: Show installation prompt if app not installed
async function checkAndPromptInstallation() {
    const isInstalled = await checkAppInstallation();
    const shop = getShopDomain();
    
    if (!isInstalled && shop) {
        const installPrompt = document.createElement('div');
        installPrompt.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 1000;
            max-width: 300px;
        `;
        installPrompt.innerHTML = `
            <strong>⚠️ App Not Installed</strong>
            <p>Please install the app for ${shop}</p>
            <button onclick="installCurrentShop()" style="background: #2c5aa0; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                Install Now
            </button>
        `;
        document.body.appendChild(installPrompt);
    }
}

// NEW: Install app for current shop
function installCurrentShop() {
    const shop = getShopDomain();
    if (shop) {
        window.location.href = `/auth?shop=${shop}`;
    }
}

// Call installation check on page load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(checkAndPromptInstallation, 2000);
});