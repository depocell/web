"""
engines/checkin_engine.py
Engine Check-in Lapangan SCO:
1. Verifikasi foto selfie di depan toko menggunakan Gemini Vision AI.
2. Penyimpanan log check-in & koordinat GPS ke SQLite (MASTER/master_data.db).
"""

import os
import json
import time
import base64
import sqlite3
import datetime
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
DB_PATH = os.path.join(MASTER_DIR, "master_data.db")
PHOTO_DIR = os.path.join(BASE_DIR, ".cache", "checkin_photos")


def _load_gemini_config():
    """Membaca GEMINI_API_KEYS dan GEMINI_MODEL dari env, .env lokal, atau fallback c:\\depotpulsa\\.env."""
    keys_raw = os.environ.get("GEMINI_API_KEYS", "")
    model = os.environ.get("GEMINI_MODEL", "")

    env_candidates = [
        os.path.join(BASE_DIR, ".env"),
        r"C:\depotpulsa\.env",
    ]
    for env_path in env_candidates:
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k == "GEMINI_API_KEYS" and not keys_raw:
                            keys_raw = v
                        elif k == "GEMINI_MODEL" and not model:
                            model = v
            except Exception:
                pass

    keys = [k.strip() for k in keys_raw.split(",") if k.strip()]
    if not model:
        model = "gemini-3.5-flash-lite"
    return keys, model


def ensure_checkin_table():
    """Membuat tabel sco_checkins jika belum tersedia di master_data.db."""
    os.makedirs(MASTER_DIR, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sco_checkins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sco_name TEXT NOT NULL,
                agen_id TEXT NOT NULL,
                agen_name TEXT,
                checkin_date TEXT NOT NULL,
                checkin_time TEXT NOT NULL,
                lat REAL,
                lon REAL,
                distance_m REAL,
                is_within_radius INTEGER DEFAULT 1,
                ai_valid INTEGER DEFAULT 1,
                ai_reason TEXT,
                photo_file TEXT,
                note TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sco_checkins_date ON sco_checkins(checkin_date, sco_name)")
        conn.commit()


def verify_selfie_storefront(photo_b64: str, agen_name: str = "") -> dict:
    """
    Verifikasi foto selfie di depan bangunan toko menggunakan Gemini Vision API.
    Mengembalikan dict: {valid, has_person, has_storefront, is_screen_photo, reason, skipped}.
    """
    if not photo_b64:
        return {"valid": False, "reason": "Foto wajib diambil langsung dari kamera."}

    # Bersihkan prefix data URI jika ada
    mime_type = "image/jpeg"
    raw_b64 = photo_b64.strip()
    if raw_b64.startswith("data:") and "," in raw_b64:
        header, raw_b64 = raw_b64.split(",", 1)
        if "image/png" in header:
            mime_type = "image/png"
        elif "image/webp" in header:
            mime_type = "image/webp"

    keys, model = _load_gemini_config()
    if not keys:
        return {
            "valid": True,
            "has_person": True,
            "has_storefront": True,
            "is_screen_photo": False,
            "reason": "AI key belum dikonfigurasi, verifikasi dilewati.",
            "skipped": True,
        }

    prompt = (
        "Kamu adalah sistem verifikasi anti-fraud kunjungan sales lapangan (SCO) di Indonesia. "
        f"Sales mengaku sedang check-in di depan toko/konter '{agen_name}'.\n"
        "Periksa foto ini dengan KETAT dan jawab HANYA dalam format JSON valid tanpa markdown:\n"
        '{"valid": boolean, "has_person": boolean, "has_storefront": boolean, "is_screen_photo": boolean, "reason": "penjelasan singkat Bahasa Indonesia"}\n\n'
        "Kriteria penilaian:\n"
        "1. has_person: true jika terlihat wajah/orang yang melakukan selfie.\n"
        "2. has_storefront: true jika di latar belakang terlihat jelas bagian luar/depan toko, konter pulsa, ruko, bangunan toko, spanduk/banner toko, etalase, atau pintu rolling door toko.\n"
        "   Set has_storefront = false jika latar belakang HANYA tembok polos, kamar/ruangan rumah kosong, langit saja, jalan kosong tanpa bangunan toko, atau interior mobil/motor.\n"
        "3. is_screen_photo: true jika foto ini tampak memotret layar HP/monitor/foto lain.\n"
        "4. valid: true HANYA jika has_person == true AND has_storefront == true AND is_screen_photo == false.\n"
        "5. Jika valid == false, tulis alasan penolakan yang jelas dan sopan pada field 'reason' (misal: 'Latar belakang bangunan toko tidak terlihat, hanya background kosong/tembok polos.')."
    )

    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": mime_type, "data": raw_b64}}
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 256,
            "responseMimeType": "application/json"
        }
    }
    body_bytes = json.dumps(payload).encode("utf-8")

    last_err = ""
    for api_key in keys:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        req = urllib.request.Request(
            url,
            data=body_bytes,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
            text = (
                res_json.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
                .strip()
            )
            if text.startswith("```"):
                text = text.strip("`")
                if text.lower().startswith("json"):
                    text = text[4:].strip()
            parsed = json.loads(text)
            return {
                "valid": bool(parsed.get("valid", False)),
                "has_person": bool(parsed.get("has_person", False)),
                "has_storefront": bool(parsed.get("has_storefront", False)),
                "is_screen_photo": bool(parsed.get("is_screen_photo", False)),
                "reason": str(parsed.get("reason", "")).strip() or "Verifikasi foto selesai.",
            }
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="ignore")[:200]
            except Exception:
                pass
            last_err = f"HTTP {e.code}: {err_body}"
            continue
        except Exception as e:
            last_err = str(e)
            continue

    return {
        "valid": False,
        "reason": f"Gagal terhubung ke layanan verifikasi AI ({last_err}). Coba ulangi beberapa detik lagi.",
    }


def save_checkin(
    sco_name: str,
    agen_id: str,
    agen_name: str,
    lat: float,
    lon: float,
    distance_m: float,
    photo_b64: str,
    note: str = "",
    max_radius_m: float = 150.0,
) -> dict:
    """
    Memverifikasi foto selfie via AI, lalu menyimpan check-in SCO ke SQLite jika valid.
    """
    sco_name = str(sco_name or "").strip()
    agen_id = str(agen_id or "").strip().upper()
    agen_name = str(agen_name or agen_id).strip()

    if not sco_name or not agen_id:
        return {"ok": False, "error": "Nama SCO dan ID Toko wajib diisi."}

    ai_res = verify_selfie_storefront(photo_b64, agen_name=agen_name)
    if not ai_res.get("valid"):
        return {
            "ok": False,
            "rejected_by_ai": True,
            "error": ai_res.get("reason") or "Foto ditolak: Pastikan selfie terlihat jelas di depan bangunan toko.",
            "ai": ai_res,
        }

    ensure_checkin_table()
    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")
    created_at = now.strftime("%Y-%m-%d %H:%M:%S")

    # Simpan file foto ke .cache/checkin_photos/
    photo_file = ""
    try:
        os.makedirs(PHOTO_DIR, exist_ok=True)
        raw_b64 = photo_b64.split(",", 1)[1] if ("," in photo_b64) else photo_b64
        fname = f"{date_str}_{agen_id}_{int(time.time())}.jpg"
        fpath = os.path.join(PHOTO_DIR, fname)
        with open(fpath, "wb") as f:
            f.write(base64.b64decode(raw_b64))
        photo_file = fname
    except Exception:
        photo_file = ""

    dist_val = float(distance_m) if distance_m is not None else -1.0
    within_rad = 1 if (dist_val < 0 or dist_val <= max_radius_m) else 0

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO sco_checkins (
                sco_name, agen_id, agen_name, checkin_date, checkin_time,
                lat, lon, distance_m, is_within_radius, ai_valid, ai_reason,
                photo_file, note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                sco_name, agen_id, agen_name, date_str, time_str,
                float(lat) if lat is not None else None,
                float(lon) if lon is not None else None,
                dist_val, within_rad, 1, ai_res.get("reason", ""),
                photo_file, str(note or "").strip(), created_at
            )
        )
        new_id = cur.lastrowid
        conn.commit()

    return {
        "ok": True,
        "checkin": {
            "id": new_id,
            "sco_name": sco_name,
            "agen_id": agen_id,
            "agen_name": agen_name,
            "checkin_date": date_str,
            "checkin_time": time_str,
            "distance_m": round(dist_val, 1) if dist_val >= 0 else None,
            "is_within_radius": bool(within_rad),
            "ai_reason": ai_res.get("reason", ""),
            "photo_file": photo_file,
        }
    }


def list_checkins(sco_name: str = "", date_str: str = "") -> list:
    """Mengambil daftar riwayat check-in SCO berdasarkan tanggal (default hari ini)."""
    ensure_checkin_table()
    if not date_str:
        date_str = datetime.datetime.now().strftime("%Y-%m-%d")

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        if sco_name and sco_name.upper() != "ALL":
            rows = conn.execute(
                "SELECT * FROM sco_checkins WHERE checkin_date = ? AND sco_name = ? ORDER BY id DESC",
                (date_str, sco_name)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM sco_checkins WHERE checkin_date = ? ORDER BY id DESC",
                (date_str,)
            ).fetchall()
    return [dict(r) for r in rows]
