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
import engines.transaction_engine as te
import engines.metrics_engine as me
import pandas as pd

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


def get_survey_candidates(
    brand: str = "ASTAGA",
    month_code: Optional[str] = None,
    year: str = "2026",
    window_months: int = 3,
) -> Dict[str, Any]:
    """
    Mengambil seluruh RESELLER pasif/churn yang siap disurvey lengkap dengan kontak WA.
    Rentang deteksi default: 3 bulan ke belakang (window_months=3).
    Misal bulan berjalan = 2026-10, memeriksa reseller yang aktif di 2026-07, 2026-08, atau 2026-09
    namun di 2026-10 transaksinya 0.
    """
    brand = (brand or "ASTAGA").strip().upper()
    year = str(year or "2026")

    # 1. Load data transaksi
    df = te.load(brand, year)
    if brand == "ASTAGA":
        df = me.filter_astaga_internal(df)

    if "is_sukses" not in df.columns:
        df["is_sukses"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False)
    if "ym" not in df.columns:
        df["ym"] = df["tgl_entry"].dt.strftime("%Y-%m")

    df_sukses = df[df["is_sukses"]]
    available_months = sorted([str(m) for m in df_sukses["ym"].dropna().unique().tolist() if str(m).startswith(year)])
    if not available_months:
        return {"ok": False, "error": "Tidak ada data transaksi"}

    if not month_code or month_code not in available_months:
        month_code = available_months[-1]

    idx = available_months.index(month_code)
    prev_window_months = available_months[max(0, idx - window_months):idx]

    # Reseller aktif di bulan berjalan
    df_curr = df_sukses[df_sukses["ym"] == month_code]
    curr_resellers = set(df_curr["ar_id"].dropna().unique())

    # Reseller aktif di jendela 3 bulan sebelumnya
    df_prev = df_sukses[df_sukses["ym"].isin(prev_window_months)]
    days_map = {m: me.get_active_days(df_sukses[df_sukses["ym"] == m]) for m in prev_window_months}
    if not df_prev.empty:
        agg_prev = df_prev.groupby(["ar_id", "ym"]).size().unstack(fill_value=0)
        agg_prev["total_trx"] = agg_prev.sum(axis=1)
        prev_resellers = set(agg_prev.index)
    else:
        agg_prev = pd.DataFrame()
        prev_resellers = set()

    churn_ids = prev_resellers - curr_resellers

    # Master meta reseller
    meta = reseller_engine.load_master_meta(brand)
    reseller_meta = meta[0] if isinstance(meta, tuple) else meta

    # Koneksi SQLite untuk ambil kontak WA dan log survey
    conn = get_db_connection()
    cur = conn.cursor()

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

    # Pre-fetch seluruh kontak reseller dalam satu query
    cur.execute("SELECT kode_reseller, no_wa, no_sms, primary_channel, source, candidate_phones FROM reseller_contacts")
    contacts_by_reseller = {}
    for row in cur.fetchall():
        contacts_by_reseller[row["kode_reseller"]] = dict(row)

    conn.close()

    candidates = []
    for rid in churn_ids:
        # Hitung breakdown dan bulan terakhir aktif
        if not agg_prev.empty and rid in agg_prev.index:
            row_agg = agg_prev.loc[rid]
            tot_trx = int(row_agg.get("total_trx", 0))
            last_m = prev_window_months[-1] if prev_window_months else "-"
            last_m_trx = 0
            for m in reversed(prev_window_months):
                val = int(row_agg.get(m, 0)) if m in agg_prev.columns else 0
                if val > 0:
                    last_m = m
                    last_m_trx = val
                    break
            monthly_breakdown = {m: int(row_agg.get(m, 0)) if m in agg_prev.columns else 0 for m in prev_window_months}
            monthly_daily = {m: round(monthly_breakdown[m] / max(1, days_map.get(m, 30)), 1) for m in prev_window_months}
        else:
            tot_trx = 0
            last_m = "-"
            last_m_trx = 0
            monthly_breakdown = {}
            monthly_daily = {}

        r_info = reseller_meta.get(rid, {})
        cname = r_info.get("name", rid)
        aname = r_info.get("agen_name", "-")
        cabang = r_info.get("cabang", "-")
        sco = r_info.get("sco", "-")

        # Kontak
        c_row = contacts_by_reseller.get(rid)
        phone = None
        channel = "WHATSAPP"
        source = "NONE"
        candidate_phones = []
        if c_row:
            phone = c_row.get("no_wa") or c_row.get("no_sms")
            channel = c_row.get("primary_channel") or "WHATSAPP"
            source = c_row.get("source") or "-"
            if c_row.get("candidate_phones"):
                try:
                    candidate_phones = json.loads(c_row["candidate_phones"])
                except Exception:
                    candidate_phones = [phone] if phone else []
            elif phone:
                candidate_phones = [phone]

        # Log status sebelumnya
        log_info = logs_by_reseller.get(rid, {})
        status = log_info.get("status", "BELUM_DISURVEY")

        candidate_item = {
            "reseller_id": rid,
            "agen_id": rid,  # alias kompatibilitas
            "reseller_name": cname,
            "agen_name": aname,
            "induk_name": aname,
            "cabang": cabang,
            "sco_name": sco,
            "prev_trx": tot_trx,
            "curr_trx": 0,
            "last_active_month": last_m,
            "last_month_trx": last_m_trx,
            "monthly_breakdown": monthly_breakdown,
            "monthly_daily": monthly_daily,
            "monthly_days": days_map,
            "window_months": prev_window_months,
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

    # Urutkan berdasarkan transaksi terbanyak (descending)
    candidates.sort(key=lambda x: x["prev_trx"], reverse=True)

    total_candidates = len(candidates)
    ready_count = sum(1 for c in candidates if c["no_wa"])
    sent_count = sum(1 for c in candidates if c["status"] in ("SENT", "DELIVERED", "REPLIED"))
    replied_count = sum(1 for c in candidates if c["status"] == "REPLIED")

    # Format rentang bulan untuk UI/informasi
    MONTH_NAMES = {
        "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
        "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
        "09": "September", "10": "Oktober", "11": "November", "12": "Desember"
    }
    if prev_window_months:
        start_m = MONTH_NAMES.get(prev_window_months[0][-2:], prev_window_months[0])
        end_m = MONTH_NAMES.get(prev_window_months[-1][-2:], prev_window_months[-1])
        window_label = f"{start_m} - {end_m} {year}"
    else:
        window_label = "-"

    return {
        "ok": True,
        "brand": brand,
        "periode": month_code,
        "window_months": prev_window_months,
        "window_label": window_label,
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
    Menyebutkan nama toko/reseller, transaksi sukses periode lalu, dan pertanyaan kendala.
    """
    nama = candidate.get("reseller_name") or candidate.get("agen_name") or "Kak"
    nama_clean = re.sub(r"\([A-Za-z0-9_]+\)$", "", str(nama)).strip()
    prev_trx = candidate.get("prev_trx", 0)
    last_active = candidate.get("last_active_month", "")

    MONTH_NAMES = {
        "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
        "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
        "09": "September", "10": "Oktober", "11": "November", "12": "Desember"
    }
    last_m_name = ""
    if last_active and len(last_active) >= 7:
        m_num = last_active[-2:]
        last_m_name = MONTH_NAMES.get(m_num, "")

    if last_active.endswith("-09"):  # Bulan lalu persis (September)
        if prev_trx > 50:
            trx_phrase = f"bulan lalu (September) akun Kakak sangat aktif bertransaksi ({prev_trx:,} transaksi)"
        elif prev_trx > 0:
            trx_phrase = f"bulan lalu (September) akun Kakak tercatat aktif bertransaksi ({prev_trx:,} transaksi)"
        else:
            trx_phrase = "sebelumnya akun Kakak terdaftar aktif bersama kami"
    elif last_m_name:  # Juli atau Agustus
        trx_phrase = f"sebelumnya di bulan {last_m_name} akun Kakak aktif bertransaksi (total {prev_trx:,} transaksi dalam 3 bulan terakhir)"
    elif prev_trx > 0:
        trx_phrase = f"sebelumnya akun Kakak tercatat aktif bertransaksi ({prev_trx:,} transaksi)"
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
    mode: str = "wa.me",
) -> Dict[str, Any]:
    """
    Mencatat pembukaan link survey reseller (wa.me) ke tabel survey_churn_logs.
    """
    target_phone = test_target_phone if is_test and test_target_phone else no_wa
    clean_target = clean_phone_number(target_phone) or target_phone
    now = datetime.now().isoformat()
    status = "SENT (wa.me)" if not is_test else "TEST (wa.me)"

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

    return {
        "ok": True,
        "log_id": log_id,
        "reseller_id": agen_id,
        "target_phone": target_phone,
        "is_test": is_test,
        "status": status,
        "mode": "wa.me",
        "gateway_status": {"delivered": True, "mode": "WA_ME_DIRECT", "note": "Dikirim via wa.me"},
        "message": message_text,
    }


def dispatch_to_wa_gateway(phone: str, message: str) -> Dict[str, Any]:
    """Gateway Baileys sudah dipensiunkan, selalu gunakan wa.me direct."""
    return {
        "delivered": True,
        "mode": "WA_ME_DIRECT",
        "note": "Dikirim langsung via link resmi wa.me",
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



