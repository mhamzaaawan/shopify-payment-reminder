// frontend/schedule.js - UPDATED FOR MULTI-STORE
document.addEventListener('DOMContentLoaded', function() {
    loadScheduleSettings();
    document.getElementById('scheduleForm').addEventListener('submit', handleScheduleSubmit);
    
    // Add click handlers for day checkboxes
    const dayCheckboxes = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    dayCheckboxes.forEach(day => {
        const checkbox = document.getElementById(day);
        const label = document.getElementById(day + 'Label');
        
        checkbox.addEventListener('change', function() {
            updateDayAppearance(day, this.checked);
        });
        
        label.addEventListener('click', function(e) {
            if (e.target.tagName !== 'INPUT') {
                checkbox.checked = !checkbox.checked;
                updateDayAppearance(day, checkbox.checked);
            }
        });
    });
});

async function loadScheduleSettings() {
    try {
        const response = await fetch('/api/schedule');
        const schedule = await response.json();
        
        if (schedule) {
            // Set day checkboxes
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            days.forEach(day => {
                const checkbox = document.getElementById(day);
                if (checkbox) {
                    checkbox.checked = schedule[day] === 1;
                    updateDayAppearance(day, checkbox.checked);
                }
            });
            
            // Set time
            if (schedule.send_time) {
                document.getElementById('sendTime').value = schedule.send_time;
            }
            
            updateCurrentScheduleDisplay(schedule);
        }
    } catch (error) {
        console.error('Error loading schedule settings:', error);
        document.getElementById('currentSchedule').innerHTML = `
            <div class="error">Error loading schedule: ${error.message}</div>
        `;
    }
}

function updateDayAppearance(day, isChecked) {
    const label = document.getElementById(day + 'Label');
    if (isChecked) {
        label.classList.add('checked');
    } else {
        label.classList.remove('checked');
    }
}

async function handleScheduleSubmit(e) {
    e.preventDefault();
    
    const scheduleData = {
        monday: document.getElementById('monday').checked ? 1 : 0,
        tuesday: document.getElementById('tuesday').checked ? 1 : 0,
        wednesday: document.getElementById('wednesday').checked ? 1 : 0,
        thursday: document.getElementById('thursday').checked ? 1 : 0,
        friday: document.getElementById('friday').checked ? 1 : 0,
        saturday: document.getElementById('saturday').checked ? 1 : 0,
        sunday: document.getElementById('sunday').checked ? 1 : 0,
        send_time: document.getElementById('sendTime').value
    };
    
    // Validate that at least one day is selected
    const daysSelected = Object.values(scheduleData).slice(0, 7).some(val => val === 1);
    if (!daysSelected) {
        if (!confirm('No days selected. This will disable all automatic reminders. Continue?')) {
            return;
        }
    }
    
    try {
        const response = await fetch('/api/schedule', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scheduleData)
        });
        
        if (response.ok) {
            await loadScheduleSettings();
            alert('✅ Schedule settings saved successfully!');
        } else {
            alert('❌ Error saving schedule settings');
        }
    } catch (error) {
        console.error('Error saving schedule:', error);
        alert('❌ Error saving schedule settings');
    }
}

function selectAllDays() {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
        const checkbox = document.getElementById(day);
        checkbox.checked = true;
        updateDayAppearance(day, true);
    });
}

function clearAllDays() {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
        const checkbox = document.getElementById(day);
        checkbox.checked = false;
        updateDayAppearance(day, false);
    });
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

function updateCurrentScheduleDisplay(schedule) {
    const container = document.getElementById('currentSchedule');
    const days = [
        { key: 'monday', name: 'Monday' },
        { key: 'tuesday', name: 'Tuesday' },
        { key: 'wednesday', name: 'Wednesday' },
        { key: 'thursday', name: 'Thursday' },
        { key: 'friday', name: 'Friday' },
        { key: 'saturday', name: 'Saturday' },
        { key: 'sunday', name: 'Sunday' }
    ];
    
    const enabledDays = days.filter(day => schedule[day.key] === 1).map(day => day.name);
    
    let scheduleText = 'No automatic reminders scheduled';
    
    if (enabledDays.length > 0) {
        scheduleText = `
            <div class="success">
                <strong>Current Schedule:</strong><br>
                📅 Days: ${enabledDays.join(', ')}<br>
                ⏰ Time: ${schedule.send_time || '09:00'}
            </div>
        `;
    } else {
        scheduleText = `
            <div class="warning">
                <strong>No automatic reminders scheduled</strong><br>
                Select days above to enable automatic reminders
            </div>
        `;
    }
    
    container.innerHTML = scheduleText;
}