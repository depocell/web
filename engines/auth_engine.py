"""
engines/auth_engine.py
Sistem Autentikasi & Manajemen Sesi Terenkripsi untuk Web Report (depas.my.id).

Fitur:
1. Penyimpanan kredensial aman di MASTER/auth_users.json (SHA-256 + Salt).
2. Token sesi HMAC-SHA256 bertanda tangan dengan timestamp kedaluwarsa.
3. Fitur "Ingat Saya" (sesi aktif hingga 30 hari).
4. Pembaruan password mandiri via antarmuka.
"""

import os
import json
import time
import hmac
import hashlib
import secrets

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
AUTH_FILE = os.path.join(MASTER_DIR, "auth_users.json")
SECRET_KEY_FILE = os.path.join(MASTER_DIR, ".server_secret")

# Durasi sesi default: 30 hari (2.592.000 detik) jika remember me, 1 hari jika tidak
SESSION_DURATION_LONG = 30 * 24 * 3600
SESSION_DURATION_SHORT = 24 * 3600


def _get_server_secret() -> bytes:
    """Mendapatkan atau menghasilkan secret key unik server untuk menandatangani cookie token."""
    os.makedirs(MASTER_DIR, exist_ok=True)
    if os.path.exists(SECRET_KEY_FILE):
        try:
            with open(SECRET_KEY_FILE, "rb") as f:
                key = f.read().strip()
                if key:
                    return key
        except Exception:
            pass
    # Generate kunci acak 32 bytes
    new_key = secrets.token_bytes(32)
    try:
        with open(SECRET_KEY_FILE, "wb") as f:
            f.write(new_key)
    except Exception:
        pass
    return new_key


def _hash_password(password: str, salt: str = None) -> tuple:
    """Menghasilkan hash kata sandi menggunakan PBKDF2 HMAC-SHA256."""
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=100000
    ).hex()
    return hashed, salt


def _load_users() -> dict:
    """Memuat database pengguna dari auth_users.json."""
    os.makedirs(MASTER_DIR, exist_ok=True)
    if not os.path.exists(AUTH_FILE):
        # Inisialisasi akun admin default: username=admin, password=depas2026
        pwd_hash, salt = _hash_password("depas2026")
        default_data = {
            "users": {
                "admin": {
                    "username": "admin",
                    "role": "admin",
                    "password_hash": pwd_hash,
                    "salt": salt,
                    "created_at": int(time.time()),
                    "updated_at": int(time.time())
                }
            }
        }
        try:
            with open(AUTH_FILE, "w", encoding="utf-8") as f:
                json.dump(default_data, f, indent=2)
        except Exception as e:
            print(f"[AUTH] Gagal menyimpan auth_users.json: {e}")
        return default_data

    try:
        with open(AUTH_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"users": {}}


def _save_users(data: dict) -> bool:
    """Menyimpan database pengguna."""
    try:
        os.makedirs(MASTER_DIR, exist_ok=True)
        with open(AUTH_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"[AUTH] Error saving users: {e}")
        return False


def verify_login(username: str, password: str) -> tuple:
    """
    Verifikasi username & password.
    Mengembalikan (success: bool, user_info: dict / error_msg: str)
    """
    if not username or not password:
        return False, "Username dan password wajib diisi."

    users_db = _load_users().get("users", {})
    u_key = username.strip().lower()

    if u_key not in users_db:
        return False, "Username atau password salah."

    u_info = users_db[u_key]
    salt = u_info.get("salt", "")
    expected_hash = u_info.get("password_hash", "")

    test_hash, _ = _hash_password(password, salt)
    if hmac.compare_digest(test_hash, expected_hash):
        return True, {
            "username": u_info.get("username", username),
            "role": u_info.get("role", "admin")
        }
    return False, "Username atau password salah."


def create_session_token(username: str, remember_me: bool = True) -> str:
    """
    Membuat token sesi bertanda tangan HMAC.
    Format: username.expires_timestamp.signature
    """
    duration = SESSION_DURATION_LONG if remember_me else SESSION_DURATION_SHORT
    expires = int(time.time()) + duration
    payload = f"{username}:{expires}"
    
    secret = _get_server_secret()
    sig = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def verify_session_token(token: str) -> tuple:
    """
    Memvalidasi token sesi.
    Mengembalikan (valid: bool, username: str)
    """
    if not token or not isinstance(token, str):
        return False, ""

    parts = token.strip().split(":")
    if len(parts) != 3:
        return False, ""

    username, expires_str, sig = parts
    try:
        expires = int(expires_str)
    except ValueError:
        return False, ""

    # Cek apakah token sudah kedaluwarsa
    if time.time() > expires:
        return False, ""

    # Verifikasi tanda tangan kriptografis
    secret = _get_server_secret()
    payload = f"{username}:{expires_str}"
    expected_sig = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()

    if hmac.compare_digest(sig, expected_sig):
        return True, username

    return False, ""


def change_password(username: str, old_password: str, new_password: str) -> tuple:
    """
    Mengubah password pengguna.
    Mengembalikan (success: bool, message: str)
    """
    if not new_password or len(new_password) < 6:
        return False, "Password baru minimal 6 karakter."

    ok, info = verify_login(username, old_password)
    if not ok:
        return False, "Password lama tidak sesuai."

    users_db = _load_users()
    u_key = username.strip().lower()
    
    pwd_hash, salt = _hash_password(new_password)
    if u_key in users_db.get("users", {}):
        users_db["users"][u_key]["password_hash"] = pwd_hash
        users_db["users"][u_key]["salt"] = salt
        users_db["users"][u_key]["updated_at"] = int(time.time())
        if _save_users(users_db):
            return True, "Password berhasil diperbarui."

    return False, "Gagal menyimpan password baru."
