// frontend/templates.js - UPDATED FOR MULTI-STORE
let currentTemplateId = null;
let templates = [];
let quillEditor;

// Available variables with descriptions
const availableVariables = {
    'order_name': 'Order Number',
    'customer_name': 'Customer Name',
    'order_total': 'Order Total Amount',
    'due_date': 'Payment Due Date',
    'invoice_url': 'Payment Link URL',
    'reminder_count': 'Reminder Number',
    'order_status': 'Order Status',
    'company_name': 'Your Company Name',
    'current_date': 'Current Date',
    'late_fee': 'Late Fee Amount'
};

document.addEventListener('DOMContentLoaded', function () {
    initializeQuillEditor();
    loadTemplates();
    document.getElementById('templateForm').addEventListener('submit', handleTemplateSubmit);

    // Auto-update preview when subject changes
    document.getElementById('templateSubject').addEventListener('input', debounce(updatePreview, 500));
});

function initializeQuillEditor() {
    quillEditor = new Quill('#quill-editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                [{ 'align': [] }],
                ['link', 'blockquote'],
                ['clean']
            ]
        },
        placeholder: 'Compose your email template here...'
    });

    // Update preview when content changes
    quillEditor.on('text-change', debounce(updatePreview, 1000));
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Insert variable into editor
function insertVariable(variable) {
    if (quillEditor) {
        const range = quillEditor.getSelection();
        const position = range ? range.index : quillEditor.getLength();
        quillEditor.insertText(position, `{{${variable}}}`);
        quillEditor.focus();

        // Show confirmation
        showInsertionConfirmation(variable);
    }
}

// Show insertion confirmation
function showInsertionConfirmation(variable) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        z-index: 1000;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    notification.innerHTML = `✅ Inserted <strong>{{${variable}}}</strong>`;
    document.body.appendChild(notification);

    setTimeout(() => {
        document.body.removeChild(notification);
    }, 2000);
}

async function loadTemplates() {
    try {
        const response = await fetch('/api/templates');
        templates = await response.json();
        displayTemplates();
    } catch (error) {
        console.error('Error loading templates:', error);
        document.getElementById('templatesList').innerHTML = `
            <div class="error">Error loading templates: ${error.message}</div>
        `;
    }
}

function displayTemplates() {
    const container = document.getElementById('templatesList');

    if (templates.length === 0) {
        container.innerHTML = `
            <div class="warning">
                <h3>No templates found</h3>
                <p>Create your first template above. The system will use templates in sequence (1st, 2nd, 3rd reminder, etc.)</p>
            </div>
        `;
        return;
    }

    container.innerHTML = templates.map(template => `
        <div class="template-item ${template.id === currentTemplateId ? 'active' : ''}">
            <div class="template-header">
                <h3>${template.name}</h3>
                ${template.is_default ? '<span class="default-badge">⭐ Default</span>' : ''}
            </div>
            <div class="template-details">
                <p><strong>Subject:</strong> ${template.subject}</p>
                <p><strong>Created:</strong> ${new Date(template.created_at).toLocaleDateString()}</p>
                <p><strong>Updated:</strong> ${new Date(template.updated_at).toLocaleDateString()}</p>
            </div>
            <div class="template-actions">
                <button class="btn btn-primary btn-sm" onclick="editTemplate(${template.id})">
                    ✏️ Edit
                </button>
                ${!template.is_default ? `
                    <button class="btn btn-success btn-sm" onclick="setDefaultTemplate(${template.id})">
                        ⭐ Set Default
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteTemplate(${template.id})">
                        🗑️ Delete
                    </button>
                ` : `
                    <span class="btn btn-secondary btn-sm" disabled>
                        ⭐ Default
                    </span>
                `}
                <button class="btn btn-warning btn-sm" onclick="previewTemplate(${template.id})">
                    👁️ Preview
                </button>
            </div>
        </div>
    `).join('');
}

function editTemplate(id) {
    const template = templates.find(t => t.id === id);
    if (template) {
        document.getElementById('templateName').value = template.name;
        document.getElementById('templateSubject').value = template.subject;

        if (quillEditor) {
            quillEditor.root.innerHTML = template.body_html;
        }

        currentTemplateId = id;
        updatePreview();

        // Scroll to form
        document.getElementById('templateForm').scrollIntoView({ behavior: 'smooth' });
    }
}

function previewTemplate(id) {
    const template = templates.find(t => t.id === id);
    if (template) {
        if (quillEditor) {
            quillEditor.root.innerHTML = template.body_html;
        }
        document.getElementById('templateSubject').value = template.subject;
        updatePreview();

        // Scroll to preview
        document.getElementById('templatePreview').scrollIntoView({ behavior: 'smooth' });
    }
}

async function setDefaultTemplate(id) {
    if (!confirm('Set this template as the default template?')) {
        return;
    }

    try {
        const response = await fetch(`/api/templates/${id}/set-default`, {
            method: 'POST'
        });

        if (response.ok) {
            await loadTemplates();
            alert('✅ Default template updated successfully!');
        } else {
            alert('❌ Error setting default template');
        }
    } catch (error) {
        console.error('Error setting default template:', error);
        alert('❌ Error setting default template');
    }
}

async function deleteTemplate(id) {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/templates/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadTemplates();
            if (currentTemplateId === id) {
                resetForm();
            }
            alert('✅ Template deleted successfully!');
        } else {
            const result = await response.json();
            alert(`❌ Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error deleting template:', error);
        alert('❌ Error deleting template');
    }
}

async function handleTemplateSubmit(e) {
    e.preventDefault();

    const templateName = document.getElementById('templateName').value;
    const templateSubject = document.getElementById('templateSubject').value;
    const templateBody = quillEditor ? quillEditor.root.innerHTML : '';

    if (!templateName || !templateSubject || !templateBody) {
        alert('❌ Please fill in all fields');
        return;
    }

    const templateData = {
        name: templateName,
        subject: templateSubject,
        body_html: templateBody
    };

    try {
        let response;
        if (currentTemplateId) {
            // Update existing template
            response = await fetch(`/api/templates/${currentTemplateId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(templateData)
            });
        } else {
            // Create new template
            response = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(templateData)
            });
        }

        if (response.ok) {
            await loadTemplates();
            resetForm();
            alert(currentTemplateId ? '✅ Template updated successfully!' : '✅ Template created successfully!');
        } else {
            alert('❌ Error saving template');
        }
    } catch (error) {
        console.error('Error saving template:', error);
        alert('❌ Error saving template');
    }
}

function resetForm() {
    document.getElementById('templateForm').reset();
    currentTemplateId = null;

    if (quillEditor) {
        quillEditor.root.innerHTML = '';
    }

    loadDefaultTemplate();
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

function loadDefaultTemplate() {
    const defaultTemplate = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
            background: #f9f9f9;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header { 
            background: #2c5aa0; 
            color: white; 
            padding: 30px 20px; 
            text-align: center; 
            border-radius: 8px 8px 0 0; 
        }
        .content { 
            padding: 30px; 
            background: white; 
            border-radius: 0 0 8px 8px;
            border: 1px solid #e1e5e9;
            border-top: none;
        }
        .footer { 
            text-align: center; 
            margin-top: 30px; 
            font-size: 12px; 
            color: #666; 
            padding: 20px;
        }
        .button { 
            background: #2c5aa0; 
            color: white; 
            padding: 12px 30px; 
            text-decoration: none; 
            border-radius: 4px; 
            display: inline-block; 
            margin: 15px 0; 
            font-weight: bold;
        }
        .order-details { 
            background: #f8f9fa; 
            padding: 20px; 
            border-radius: 4px; 
            margin: 20px 0; 
            border-left: 4px solid #2c5aa0; 
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Payment Reminder</h1>
        </div>
        <div class="content">
            <p>Hello {{customer_name}},</p>
            
            <p>This is a friendly reminder that your payment for order <strong>{{order_name}}</strong> is due.</p>
            
            <div class="order-details">
                <p><strong>Order Number:</strong> {{order_name}}</p>
                <p><strong>Amount Due:</strong> {{order_total}}</p>
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

    document.getElementById('templateName').value = 'Default Payment Reminder';
    document.getElementById('templateSubject').value = 'Payment Reminder for Your Order {{order_name}}';

    if (quillEditor) {
        quillEditor.root.innerHTML = defaultTemplate;
    }

    updatePreview();
}

function updatePreview() {
    const body = quillEditor ? quillEditor.root.innerHTML : '';
    const subject = document.getElementById('templateSubject').value;
    const preview = document.getElementById('templatePreview');

    if (!body.trim()) {
        preview.innerHTML = `
            <div style="text-align: center; color: #666; padding: 50px;">
                <p>👆 Start typing in the editor to see preview here</p>
                <p><small>Variables will be replaced with sample data</small></p>
            </div>
        `;
        return;
    }

    // Sample data for preview
    const sampleData = {
        order_name: 'DRAFT-#1001',
        customer_name: 'John Smith',
        order_total: '$149.99',
        due_date: new Date().toLocaleDateString(),
        invoice_url: '#',
        reminder_count: '1',
        order_status: 'Pending',
        company_name: 'Your Company',
        current_date: new Date().toLocaleDateString(),
        late_fee: '$15.00'
    };

    let previewHtml = body;
    let previewSubject = subject;

    // Replace variables in both body and subject
    for (const [key, value] of Object.entries(sampleData)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        previewHtml = previewHtml.replace(regex, value);
        previewSubject = previewSubject.replace(regex, value);
    }

    preview.innerHTML = `
        <div style="border-bottom: 2px solid #e1e5e9; padding-bottom: 15px; margin-bottom: 20px;">
            <strong style="color: #2c5aa0;">Email Subject:</strong><br>
            <div style="font-size: 16px; font-weight: bold; margin-top: 5px;">${previewSubject}</div>
        </div>
        ${previewHtml}
    `;
}