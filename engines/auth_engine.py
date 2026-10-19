"""
engines/auth_engine.py
Sistem Autentikasi & Manajemen Sesi Terenkripsi untuk Web Report (depas.my.id).

Fitur:
1. Penyimpanan kredensial aman di MASTER/auth_users.json (PBKDF2 HMAC-SHA256 + Salt).
2. Token sesi HMAC-SHA256 bertanda tangan dengan timestamp kedaluwarsa & role.
3. Mendukung multi-role: "admin" (Manajemen/Full Access) dan "tamu" (Non-Admin / Operational Only).
4. Manajemen User lengkap: List, Tambah User, Reset Password, Hapus User.
"""

import os
import json
import time
import hmac
import hashlib
import secrets
from typing import Dict, Any, List, Optional, Tuple

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
AUTH_FILE = os.path.join(MASTER_DIR, "auth_users.json")
SECRET_KEY_FILE = os.path.join(MASTER_DIR, ".server_secret")

# Durasi sesi default: 30 hari jika remember me, 1 hari jika tidak
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
    """Memuat database pengguna dari auth_users.json dengan inisialisasi default admin & tamu."""
    os.makedirs(MASTER_DIR, exist_ok=True)
    data = {"users": {}}
    if os.path.exists(AUTH_FILE):
        try:
            with open(AUTH_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {"users": {}}

    users = data.get("users", {})
    dirty = False

    # 1. Pastikan akun admin default ada (admin / depas2026)
    if "admin" not in users:
        pwd_hash, salt = _hash_password("depas2026")
        users["admin"] = {
            "username": "admin",
            "role": "admin",
            "password_hash": pwd_hash,
            "salt": salt,
            "created_at": int(time.time()),
            "updated_at": int(time.time())
        }
        dirty = True

    # 2. Pastikan akun tamu default ada (tamu / 1234)
    if "tamu" not in users:
        pwd_hash, salt = _hash_password("1234")
        users["tamu"] = {
            "username": "tamu",
            "role": "tamu",
            "password_hash": pwd_hash,
            "salt": salt,
            "created_at": int(time.time()),
            "updated_at": int(time.time())
        }
        dirty = True

    data["users"] = users
    if dirty:
        _save_users(data)
    return data


def _save_users(data: dict) -> bool:
    """Menyimpan database pengguna ke auth_users.json."""
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
            "role": u_info.get("role", "tamu")
        }
    return False, "Username atau password salah."


def create_session_token(username: str, role: str = "tamu", remember_me: bool = True) -> str:
    """
    Membuat token sesi bertanda tangan HMAC.
    Format: username:role:expires_timestamp:signature
    """
    duration = SESSION_DURATION_LONG if remember_me else SESSION_DURATION_SHORT
    expires = int(time.time()) + duration
    payload = f"{username}:{role}:{expires}"
    
    secret = _get_server_secret()
    sig = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def verify_session_token(token: str) -> tuple:
    """
    Memvalidasi token sesi.
    Mengembalikan (valid: bool, username: str, role: str)
    """
    if not token or not isinstance(token, str):
        return False, "", "guest"

    parts = token.strip().split(":")
    secret = _get_server_secret()

    # Format Baru: username:role:expires:sig (4 bagian)
    if len(parts) == 4:
        username, role, expires_str, sig = parts
        try:
            expires = int(expires_str)
        except ValueError:
            return False, "", "guest"

        if time.time() > expires:
            return False, "", "guest"

        payload = f"{username}:{role}:{expires_str}"
        expected_sig = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, expected_sig):
            return True, username, role
        return False, "", "guest"

    # Format Legacy: username:expires:sig (3 bagian)
    if len(parts) == 3:
        username, expires_str, sig = parts
        try:
            expires = int(expires_str)
        except ValueError:
            return False, "", "guest"

        if time.time() > expires:
            return False, "", "guest"

        payload = f"{username}:{expires_str}"
        expected_sig = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, expected_sig):
            # Lookup role
            u = get_user(username)
            role = u.get("role", "tamu") if u else "tamu"
            return True, username, role
        return False, "", "guest"

    return False, "", "guest"


def get_user(username: str) -> Optional[dict]:
    """Mengambil informasi publik pengguna berdasarkan username."""
    if not username:
        return None
    users = _load_users().get("users", {})
    u = users.get(username.strip().lower())
    if not u:
        return None
    return {
        "username": u.get("username", username),
        "role": u.get("role", "tamu"),
        "created_at": u.get("created_at"),
        "updated_at": u.get("updated_at")
    }


def list_users() -> List[dict]:
    """Mengembalikan daftar semua pengguna (tanpa password_hash & salt)."""
    users = _load_users().get("users", {})
    result = []
    for k, u in sorted(users.items(), key=lambda x: (0 if x[1].get("role") == "admin" else 1, x[0])):
        result.append({
            "username": u.get("username", k),
            "role": u.get("role", "tamu"),
            "created_at": u.get("created_at", 0),
            "updated_at": u.get("updated_at", 0)
        })
    return result


def create_user(username: str, password: str, role: str = "tamu") -> Tuple[bool, str]:
    """Membuat pengguna baru (khusus dipanggil oleh Admin)."""
    u_clean = username.strip()
    if not u_clean or len(u_clean) < 3:
        return False, "Username minimal 3 karakter."
    if not password or len(password) < 4:
        return False, "Password minimal 4 karakter."

    role_clean = role.strip().lower()
    if role_clean not in ("admin", "tamu"):
        role_clean = "tamu"

    users_db = _load_users()
    u_key = u_clean.lower()
    if u_key in users_db.get("users", {}):
        return False, f"Username '{u_clean}' sudah digunakan."

    pwd_hash, salt = _hash_password(password)
    users_db.setdefault("users", {})[u_key] = {
        "username": u_clean,
        "role": role_clean,
        "password_hash": pwd_hash,
        "salt": salt,
        "created_at": int(time.time()),
        "updated_at": int(time.time())
    }

    if _save_users(users_db):
        return True, f"Pengguna '{u_clean}' (Role: {role_clean.upper()}) berhasil dibuat."
    return False, "Gagal menyimpan database pengguna."


def admin_reset_password(username: str, new_password: str) -> Tuple[bool, str]:
    """Admin mereset password pengguna tanpa memerlukan password lama."""
    if not new_password or len(new_password) < 4:
        return False, "Password baru minimal 4 karakter."

    users_db = _load_users()
    u_key = username.strip().lower()

    if u_key not in users_db.get("users", {}):
        return False, f"Pengguna '{username}' tidak ditemukan."

    pwd_hash, salt = _hash_password(new_password)
    users_db["users"][u_key]["password_hash"] = pwd_hash
    users_db["users"][u_key]["salt"] = salt
    users_db["users"][u_key]["updated_at"] = int(time.time())

    if _save_users(users_db):
        return True, f"Password pengguna '{username}' berhasil diperbarui."
    return False, "Gagal menyimpan perubahan password."


def delete_user(username: str, current_admin: str) -> Tuple[bool, str]:
    """Menghapus pengguna dengan proteksi terhadap akun diri sendiri dan admin terakhir."""
    u_key = username.strip().lower()
    curr_key = current_admin.strip().lower()

    if u_key == curr_key:
        return False, "Anda tidak dapat menghapus akun Anda sendiri saat sedang login."

    if u_key == "admin":
        return False, "Akun utama 'admin' dilindungi dan tidak dapat dihapus."

    users_db = _load_users()
    users = users_db.get("users", {})

    if u_key not in users:
        return False, f"Pengguna '{username}' tidak ditemukan."

    del users[u_key]
    users_db["users"] = users

    if _save_users(users_db):
        return True, f"Pengguna '{username}' berhasil dihapus."
    return False, "Gagal menghapus pengguna."
