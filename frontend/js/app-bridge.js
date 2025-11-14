// frontend/js/app-bridge.js
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Shopify App Bridge...');
    
    initializeShopifyApp();
});

function initializeShopifyApp() {
    // Get shop from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    let shop = urlParams.get('shop');
    
    console.log('Shop parameter from URL:', shop);
    
    if (!shop) {
        // Try to get shop from sessionStorage (for navigation)
        shop = sessionStorage.getItem('shop');
        console.log('Shop from sessionStorage:', shop);
        
        if (shop) {
            // Redirect to current page with shop parameter
            const currentPath = window.location.pathname;
            const newUrl = `${currentPath}?shop=${shop}`;
            console.log('Redirecting to:', newUrl);
            window.location.href = newUrl;
            return;
        }
    }
    
    if (!shop) {
        console.error('No shop parameter found');
        showShopError();
        return;
    }
    
    // Store shop in sessionStorage for navigation
    sessionStorage.setItem('shop', shop);
    console.log('Shop stored in sessionStorage:', shop);
    
    // Initialize App Bridge and update navigation
    initializeAppBridge(shop);
    updateAllNavigationLinks(shop);
}

function initializeAppBridge(shop) {
    try {
        console.log('Initializing App Bridge for shop:', shop);
        
        if (typeof window['app-bridge'] === 'undefined') {
            console.error('App Bridge library not loaded');
            return;
        }
        
        const AppBridge = window['app-bridge'];
        const createApp = AppBridge.default;
        
        // Get API key from meta tag
        const apiKey = document.querySelector('meta[name="shopify-api-key"]')?.getAttribute('content') || '5911e5a496720584842b1e649a6d6cd8';
        
        window.app = createApp({
            apiKey: apiKey,
            host: btoa(shop),
            forceRedirect: false
        });
        
        console.log('App Bridge initialized successfully');
        
    } catch (error) {
        console.error('Error initializing App Bridge:', error);
    }
}

function updateAllNavigationLinks(shop) {
    console.log('Updating navigation links for shop:', shop);
    
    // Update all navigation links to include shop parameter
    const navLinks = document.querySelectorAll('a[href^="/"]');
    navLinks.forEach(link => {
        const originalHref = link.getAttribute('href');
        if (originalHref && !originalHref.includes('?')) {
            const newHref = `${originalHref}?shop=${shop}`;
            link.setAttribute('href', newHref);
            console.log('Updated link:', originalHref, '→', newHref);
        }
    });
}

function showShopError() {
    // Remove existing error if any
    const existingError = document.querySelector('.shop-error');
    if (existingError) existingError.remove();
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'shop-error';
    errorDiv.style.cssText = `
        background: #ffe6e6;
        border: 1px solid #ff4444;
        color: #cc0000;
        padding: 20px;
        margin: 20px;
        border-radius: 8px;
        text-align: center;
    `;
    errorDiv.innerHTML = `
        <h3>⚠️ Shop Parameter Missing</h3>
        <p>This app requires a shop parameter to function properly.</p>
        <p>Please access this app through your Shopify admin.</p>
        <div style="margin-top: 15px;">
            <button onclick="location.reload()" style="padding: 10px 20px; margin: 5px; background: #5c6ac4; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry</button>
            <button onclick="goToShopifyAdmin()" style="padding: 10px 20px; margin: 5px; background: #202223; color: white; border: none; border-radius: 4px; cursor: pointer;">Go to Shopify Admin</button>
        </div>
    `;
    
    document.body.insertBefore(errorDiv, document.body.firstChild);
}

function goToShopifyAdmin() {
    if (document.referrer && document.referrer.includes('myshopify.com')) {
        window.location.href = document.referrer;
    } else {
        alert('Please navigate to your Shopify admin and open the app from there.');
    }
}

// Make function available globally
window.initializeShopifyApp = initializeShopifyApp;