"""
engines/survey_engine.py
Engine Pengelolaan Survey Interaktif Khusus RESELLER Churn / Pasif Berbasis AI & WhatsApp.

Fungsi Utama:
1. get_survey_candidates(brand, month_code, year):
   Mengambil kandidat survey dari daftar RESELLER pasif/churn (reseller_engine)
   dan menggabungkannya dengan nomor WhatsApp terverifikasi dari master_data.db.
2. generate_survey_message(candidate, brand):
   Menghasilkan teks sapaan personalisasi natural berbasis histori transaksi reseller.
3. record_survey_send(brand, periode, ...):
   Mencatat dan mengeksekusi pengiriman pesan survey (mendukung mode uji coba).
4. record_survey_reply(log_id, reply_text):
   Menganalisa jawaban reseller menggunakan NLP/AI untuk menentukan kategori kendala,
   sentimen, dan kebutuhan kunjungan tim SCO.
"""

import os
import sqlite3
import re
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

import engines.reseller_engine as reseller_engine

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "MASTER", "master_data.db")

logger = logging.getLogger("survey_engine")


def get_db_connection() -> sqlite3.Connection:
    """Membuka koneksi ke SQLite master_data.db dengan row_factory dictionary."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def clean_phone_number(raw_val: Any) -> Optional[str]:
    """Standarisasi format nomor HP Indonesia ke 628xxxxxxxxxx."""
    if not raw_val:
        return None
    s = str(raw_val).strip().replace("@c.us", "").replace("+", "").replace("-", "").replace(" ", "")
    s = re.sub(r"[^0-9]", "", s)
    if not s:
        return None
    if s.startswith("08"):
        s = "628" + s[2:]
    elif s.startswith("8"):
        s = "628" + s[1:]
    return s if s.startswith("628") and len(s) >= 10 else None


def get_survey_candidates(brand: str = "ASTAGA", month_code: Optional[str] = None, year: str = "2026") -> Dict[str, Any]:
    """
    Mengambil seluruh RESELLER pasif/churn yang siap disurvey lengkap dengan kontak WA.
    Data diambil langsung dari reseller_engine (159 reseller churn) dan di-join dengan tabel reseller_contacts.
    """
    if not month_code:
        now = datetime.now()
        month_code = f"{year}-{now.month:02d}"

    # 1. Ambil data dashboard reseller untuk mendapatkan churn_rows
    dash = reseller_engine.calculate_reseller_dashboard(brand=brand, month_code=month_code, year=year)
    churn_rows = dash.get("churn_rows", [])

    conn = get_db_connection()
    cur = conn.cursor()

    # Ambil log survey periode ini agar tahu status terakhir per reseller (kode)
    cur.execute(
        """
        SELECT agen_id AS reseller_id, id AS log_id, status, no_wa, sent_at, reply_received, 
               ai_category, ai_sentiment, ai_summary, need_sco_visit
        FROM survey_churn_logs
        WHERE brand = ? AND periode = ?
        ORDER BY id DESC
        """,
        (brand, month_code),
    )
    logs_by_reseller = {}
    for row in cur.fetchall():
        rid = row["reseller_id"]
        if rid not in logs_by_reseller:
            logs_by_reseller[rid] = dict(row)

    candidates = []
    for r in churn_rows:
        cid = r["kode"]
        cname = r.get("name", cid)
        agen_id = r.get("agen_id", "-")
        agen_name = r.get("agen_name", "-")
        cabang = r.get("cabang", "-")
        sco = r.get("sco", "-")
        prev_trx = int(r.get("prev_trx", 0))

        # Cari kontak di reseller_contacts
        cur.execute("SELECT no_wa, no_sms, primary_channel, source, candidate_phones FROM reseller_contacts WHERE kode_reseller = ?", (cid,))
        c_row = cur.fetchone()

        phone = None
        channel = "WHATSAPP"
        source = "NONE"
        candidate_phones = []
        if c_row:
            phone = c_row["no_wa"] or c_row["no_sms"]
            channel = c_row["primary_channel"] or "WHATSAPP"
            source = c_row["source"] or "-"
            if c_row["candidate_phones"]:
                try:
                    candidate_phones = json.loads(c_row["candidate_phones"])
                except Exception:
                    candidate_phones = [phone] if phone else []
            elif phone:
                candidate_phones = [phone]

        # Log status sebelumnya
        log_info = logs_by_reseller.get(cid, {})
        status = log_info.get("status", "BELUM_DISURVEY")

        candidate_item = {
            "reseller_id": cid,
            "agen_id": cid,  # alias kompatibilitas
            "reseller_name": cname,
            "agen_name": agen_name,
            "induk_name": agen_name,
            "cabang": cabang,
            "sco_name": sco,
            "prev_trx": prev_trx,
            "curr_trx": 0,
            "no_wa": phone,
            "candidate_phones": candidate_phones,
            "candidate_count": len(candidate_phones),
            "primary_channel": channel,
            "source": source,
            "status": status,
            "log_id": log_info.get("log_id"),
            "sent_at": log_info.get("sent_at"),
            "reply_received": log_info.get("reply_received"),
            "ai_category": log_info.get("ai_category"),
            "ai_sentiment": log_info.get("ai_sentiment"),
            "ai_summary": log_info.get("ai_summary"),
            "need_sco_visit": log_info.get("need_sco_visit", 0),
        }
        candidates.append(candidate_item)

    conn.close()

    total_candidates = len(candidates)
    ready_count = sum(1 for c in candidates if c["no_wa"])
    sent_count = sum(1 for c in candidates if c["status"] in ("SENT", "DELIVERED", "REPLIED"))
    replied_count = sum(1 for c in candidates if c["status"] == "REPLIED")

    return {
        "ok": True,
        "brand": brand,
        "periode": month_code,
        "summary": {
            "total_churn": total_candidates,
            "ready_to_survey": ready_count,
            "already_surveyed": sent_count,
            "replied": replied_count,
            "uncontactable": total_candidates - ready_count,
        },
        "candidates": candidates,
    }


def generate_survey_message(candidate: Dict[str, Any], brand: str = "ASTAGA") -> str:
    """
    Menghasilkan teks sapaan personalisasi ramah dan empatik untuk RESELLER.
    Menyebutkan nama toko/reseller, transaksi sukses bulan lalu, dan pertanyaan kendala.
    """
    nama = candidate.get("reseller_name") or candidate.get("agen_name") or "Kak"
    nama_clean = re.sub(r"\([A-Za-z0-9_]+\)$", "", str(nama)).strip()
    prev_trx = candidate.get("prev_trx", 0)

    if prev_trx > 50:
        trx_phrase = f"bulan lalu akun Kakak sangat aktif bertransaksi ({prev_trx:,} transaksi)"
    elif prev_trx > 0:
        trx_phrase = f"bulan lalu akun Kakak tercatat aktif bertransaksi ({prev_trx:,} transaksi)"
    else:
        trx_phrase = "sebelumnya akun Kakak terdaftar aktif bersama kami"

    msg = (
        f"Halo Kak di *{nama_clean}*! Salam hangat dari tim layanan *{brand}*.\n\n"
        f"Kami perhatikan {trx_phrase}. Namun di bulan ini kami melihat belum ada transaksi yang tercatat di sistem kami.\n\n"
        f"Boleh kami tahu Kak, apakah saat ini ada kendala teknis pada aplikasi, kendala harga/stok produk, atau ada kendala modal/saldo? "
        f"Kami sangat ingin membantu agar penjualan pulsa di toko Kakak bisa kembali lancar.\n\n"
        f"Terima kasih banyak atas waktunya ya Kak!"
    )
    return msg


def record_survey_send(
    brand: str,
    periode: str,
    agen_id: str,
    agen_name: str,
    cabang: str,
    sco_name: str,
    no_wa: str,
    prev_trx: int,
    message_text: str,
    is_test: bool = False,
    test_target_phone: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Mencatat pengiriman pesan survey reseller ke tabel survey_churn_logs.
    """
    target_phone = test_target_phone if is_test and test_target_phone else no_wa
    clean_target = clean_phone_number(target_phone) or target_phone
    now = datetime.now().isoformat()
    status = "TEST_SENT" if is_test else "SENT"

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO survey_churn_logs 
        (brand, periode, agen_id, agen_name, cabang, sco_name, no_wa, prev_trx, curr_trx, status, message_sent, sent_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        """,
        (brand, periode, agen_id, agen_name, cabang, sco_name, clean_target, prev_trx, status, message_text, now, now),
    )
    conn.commit()
    log_id = cur.lastrowid
    conn.close()

    dispatch_result = dispatch_to_wa_gateway(clean_target, message_text)
    if dispatch_result.get("notOnWhatsApp"):
        status = "NOT_ON_WA"
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE survey_churn_logs 
            SET status = 'NOT_ON_WA', ai_category = 'NO_WHATSAPP', updated_at = ? 
            WHERE id = ?
            """,
            (datetime.now().isoformat(), log_id),
        )
        conn.commit()
        conn.close()

    return {
        "ok": True,
        "log_id": log_id,
        "reseller_id": agen_id,
        "target_phone": target_phone,
        "is_test": is_test,
        "status": status,
        "not_on_wa": bool(dispatch_result.get("notOnWhatsApp")),
        "gateway_status": dispatch_result,
        "message": message_text,
    }


def dispatch_to_wa_gateway(phone: str, message: str) -> Dict[str, Any]:
    """Helper dispatch pengiriman pesan via WhatsApp Gateway lokal atau remote."""
    clean_p = clean_phone_number(phone)
    if not clean_p:
        return {"delivered": False, "error": "Nomor WhatsApp tidak valid"}

    gateway_url = os.environ.get("WA_GATEWAY_URL", "http://localhost:3000/send-message")
    try:
        import urllib.request

        payload = json.dumps({"phone": clean_p, "message": message}).encode("utf-8")
        req = urllib.request.Request(
            gateway_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            resp_body = resp.read().decode("utf-8")
            data = json.loads(resp_body) if resp_body else {}
            if data.get("notOnWhatsApp"):
                return {"delivered": False, "notOnWhatsApp": True, "error": "Nomor tidak terdaftar di WhatsApp"}
            if resp.status in (200, 201) and data.get("ok"):
                return {"delivered": True, "mode": "GATEWAY_ACTIVE", "messageId": data.get("messageId")}
    except Exception as e:
        logger.debug(f"WA Gateway error / trial mode: {e}")

    return {
        "delivered": False,
        "mode": "SIMULATION_STANDBY",
        "note": "Pesan dicatat di database. Reseller dalam antrean.",
    }


def analyze_reply_nlp(reply_text: str) -> Dict[str, Any]:
    """Analisa klasifikasi intent dan sentimen jawaban reseller."""
    text_lower = reply_text.lower()

    if any(k in text_lower for k in ["error", "gangguan", "lemot", "timeout", "gagal", "login", "aplikasi", "otp", "rusak"]):
        category = "KENDALA_APLIKASI"
    elif any(k in text_lower for k in ["mahal", "harga", "sebelah", "kompetitor", "untung kecil", "lebih murah"]):
        category = "KENDALA_HARGA"
    elif any(k in text_lower for k in ["modal", "saldo", "duit", "dana", "sepi", "lagi belum", "ketahan"]):
        category = "KENDALA_SALDO"
    elif any(k in text_lower for k in ["tutup", "pindah", "libur", "ngga jualan", "tidak jualan", "ganti"]):
        category = "TOKO_TUTUP"
    else:
        category = "LAINNYA"

    if any(k in text_lower for k in ["terima kasih", "makasih", "siap", "oke", "nanti isi", "segera"]):
        sentiment = "POSITIF"
    elif any(k in text_lower for k in ["kecewa", "rugi", "jelek", "buruk", "kesel", "marah"]):
        sentiment = "NEGATIF"
    else:
        sentiment = "NETRAL"

    need_visit = 1 if any(k in text_lower for k in ["sales", "sco", "datang", "spanduk", "brosur", "kunjungi", "bantu"]) else 0

    clean_words = reply_text.strip().replace("\n", " ")
    summary = clean_words[:120] + ("..." if len(clean_words) > 120 else "")

    return {
        "ai_category": category,
        "ai_sentiment": sentiment,
        "ai_summary": summary,
        "need_sco_visit": need_visit,
    }


def record_survey_reply(log_id: int, reply_text: str) -> Dict[str, Any]:
    """Menyimpan balasan reseller dan memperbarui status log ke REPLIED."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT reply_received FROM survey_churn_logs WHERE id = ?", (log_id,))
    row = cur.fetchone()
    existing = row["reply_received"] if row and row["reply_received"] else ""

    if existing and existing != reply_text:
        full_text = f"{existing}\n[Lanjutan]: {reply_text}"
    else:
        full_text = reply_text

    analysis = analyze_reply_nlp(full_text)
    now = datetime.now().isoformat()

    cur.execute(
        """
        UPDATE survey_churn_logs
        SET status = 'REPLIED',
            reply_received = ?,
            replied_at = ?,
            ai_category = ?,
            ai_sentiment = ?,
            ai_summary = ?,
            need_sco_visit = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            full_text,
            now,
            analysis["ai_category"],
            analysis["ai_sentiment"],
            analysis["ai_summary"],
            analysis["need_sco_visit"],
            now,
            log_id,
        ),
    )
    conn.commit()
    conn.close()

    return {"ok": True, "log_id": log_id, "analysis": analysis}


def process_incoming_wa_webhook(phone: str, text: str) -> Dict[str, Any]:
    """
    Menerima webhook dari WA Gateway saat reseller membalas chat WhatsApp.
    Mencari log survey terakhir untuk nomor tersebut, mencatat balasan,
    menjalankan analisa NLP intent & sentimen secara otomatis,
    dan mengirimkan 1x pesan penutup apresiasi mengarahkan ke CS Resmi (+62 857-7197-5556).
    """
    clean_p = clean_phone_number(phone) or phone
    last_9 = clean_p[-9:] if len(clean_p) >= 9 else clean_p

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, agen_id, agen_name, status, brand, reply_received
        FROM survey_churn_logs
        WHERE no_wa = ? OR no_wa LIKE ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (clean_p, f"%{last_9}%"),
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        logger.info(f"Incoming message from +{clean_p} but no active survey found: {text}")
        return {"ok": False, "note": "Tidak ada log survey aktif untuk nomor ini"}

    log_id = row["id"]
    prev_status = row["status"]
    brand_name = row["brand"] or "ASTAGA"

    is_first_reply = prev_status in ("SENT", "TEST_SENT")
    reply_res = record_survey_reply(log_id, text)

    # Kirim 1x pesan penutup otomatis jika ini balasan pertama
    if is_first_reply:
        closing_msg = (
            f"Terima kasih banyak atas informasinya ya Kak! Masukan Kakak sangat berharga untuk peningkatan layanan kami.\n\n"
            f"Jika Kakak membutuhkan bantuan transaksi, cek saldo, atau kendala aplikasi, "
            f"tim Customer Service {brand_name} siap melayani Kakak dengan senang hati di:\n"
            f"WhatsApp CS: 0857-7197-5556\n"
            f"Link: https://wa.me/6285771975556\n"
            f"Email: customercare@myastaga.com\n\n"
            f"Semoga usaha konter Kakak semakin lancar dan berkah selalu ya Kak!"
        )
        try:
            dispatch_to_wa_gateway(clean_p, closing_msg)
        except Exception as e:
            logger.error(f"Gagal mengirim pesan penutup CS ke +{clean_p}: {e}")

    return reply_res


def delete_survey_log(log_id: int) -> Dict[str, Any]:
    """Menghapus satu baris log survey berdasarkan ID."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM survey_churn_logs WHERE id = ?", (log_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "deleted_id": log_id}


def clear_all_survey_logs(brand: str = "ASTAGA", periode: Optional[str] = None) -> Dict[str, Any]:
    """Menghapus seluruh riwayat log survey untuk brand / periode tertentu."""
    conn = get_db_connection()
    cur = conn.cursor()
    if periode:
        cur.execute("DELETE FROM survey_churn_logs WHERE brand = ? AND periode = ?", (brand, periode))
    else:
        cur.execute("DELETE FROM survey_churn_logs WHERE brand = ?", (brand,))
    deleted_count = cur.rowcount
    conn.commit()
    conn.close()
    return {"ok": True, "deleted_count": deleted_count}


def get_survey_history(brand: str = "ASTAGA", periode: Optional[str] = None) -> List[Dict[str, Any]]:
    """Mengambil seluruh riwayat log survey yang pernah dikirim dan dibalas."""
    conn = get_db_connection()
    cur = conn.cursor()
    query = """
        SELECT id, brand, periode, agen_id AS reseller_id, agen_name AS reseller_name,
               cabang, sco_name, no_wa, prev_trx, curr_trx, status,
               message_sent, sent_at, reply_received, replied_at,
               ai_category, ai_sentiment, ai_summary, need_sco_visit
        FROM survey_churn_logs
        WHERE brand = ?
    """
    params = [brand]
    if periode:
        query += " AND periode = ?"
        params.append(periode)
    query += " ORDER BY id DESC"

    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def update_reseller_primary_wa(kode_reseller: str, active_phone: str) -> Dict[str, Any]:
    """Mengupdate nomor WhatsApp utama reseller jika ditemukan nomor alternatif yang aktif ber-WA."""
    clean_p = clean_phone_number(active_phone)
    if not clean_p or not kode_reseller:
        return {"ok": False, "error": "Nomor atau kode reseller tidak valid"}
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE reseller_contacts
            SET no_wa = ?, primary_channel = 'WHATSAPP', updated_at = CURRENT_TIMESTAMP
            WHERE kode_reseller = ?
            """,
            (clean_p, kode_reseller.strip().upper())
        )
        conn.commit()
        conn.close()
        logger.info(f"Updated primary WA for {kode_reseller} to +{clean_p}")
        return {"ok": True, "kode_reseller": kode_reseller, "new_primary_wa": clean_p}
    except Exception as e:
        logger.error(f"Gagal update primary WA untuk {kode_reseller}: {e}")
        return {"ok": False, "error": str(e)}



