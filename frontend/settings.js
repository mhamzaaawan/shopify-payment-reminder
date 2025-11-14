// frontend/settings.js - UPDATED FOR MULTI-STORE
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
});

async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        
        // Update form
        document.getElementById('orderLimit').value = settings.order_limit || 50;
        
        // Update current settings display
        updateCurrentSettingsDisplay(settings);
    } catch (error) {
        console.error('Error loading settings:', error);
        document.getElementById('currentSettings').innerHTML = `
            <div class="error">Error loading settings: ${error.message}</div>
        `;
    }
}

async function handleSettingsSubmit(e) {
    e.preventDefault();
    
    const settingsData = {
        order_limit: parseInt(document.getElementById('orderLimit').value)
    };
    
    // Validate
    if (settingsData.order_limit < 1 || settingsData.order_limit > 1000) {
        alert('Order limit must be between 1 and 1000');
        return;
    }
    
    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsData)
        });
        
        if (response.ok) {
            await loadSettings();
            alert('✅ Settings saved successfully!');
        } else {
            const result = await response.json();
            alert(`❌ Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('❌ Error saving settings');
    }
}

function goBack() {
    // Try to go back in history
    if (window.history.length > 1) {
        window.history.back();
    } else {
        // If no history, redirect to home or previous page
        window.location.href = '/'; // Change this to your desired URL
    }
}

function updateCurrentSettingsDisplay(settings) {
    const container = document.getElementById('currentSettings');
    
    container.innerHTML = `
        <div class="success">
            <strong>Current Settings:</strong><br>
            📦 Order Limit: <strong>${settings.order_limit || 50} orders</strong><br>
            ⏰ Last Updated: ${settings.updated_at ? new Date(settings.updated_at).toLocaleString() : 'Never'}
        </div>
    `;
}