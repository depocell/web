"""
tele_bot.py
Asisten AI Pribadi DepAs di Telegram (@depas_ai_bot).
Fitur:
1. Long-polling Telegram Bot API resmi (hemat RAM, tanpa open port).
2. Terhubung langsung ke Google Gemini AI (gemini-2.5-flash).
3. Perintah /start, /help, /server (cek resource VPS), /summary (laporan performa harian).
4. Tanya-jawab bebas & analisa bisnis 24 jam.
"""

import os
import re
import sys
import time
import json
import logging
import subprocess
import requests

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("depas_telebot")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(BASE_DIR, ".env")

# 1. Load Environment Variables
def load_env():
    env_vars = {}
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars

ENV = load_env()
GEMINI_API_KEY = ENV.get("GEMINI_API_KEY")
TELEGRAM_BOT_TOKEN = ENV.get("TELEGRAM_BOT_TOKEN")

if not TELEGRAM_BOT_TOKEN:
    logger.error("TELEGRAM_BOT_TOKEN tidak ditemukan di .env!")
    sys.exit(1)

TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

# 2. Telegram Helper Functions
def format_to_telegram_html(text: str) -> str:
    """Mengubah format teks markdown Gemini menjadi HTML Telegram yang aman & bersih tanpa bintang (**) atau simbol liar."""
    if not text:
        return ""
    t = text.replace('\r\n', '\n')
    # Lindungi tag HTML yang sah jika sudah ada (b, i, code, s, u, pre, a)
    placeholders = {}
    def repl(m):
        key = f"__TAG_{len(placeholders)}__"
        placeholders[key] = m.group(0)
        return key
    t = re.sub(r'</?(?:b|i|code|s|u|pre|a(?:\s+href="[^"]*")?)>', repl, t)
    # Escape karakter HTML sisa (&, <, >)
    t = t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    # Ubah format markdown bintang ke tag HTML
    t = re.sub(r'\*{3}(.+?)\*{3}', r'<b><i>\1</i></b>', t)
    t = re.sub(r'\*{2}(.+?)\*{2}', r'<b>\1</b>', t)
    t = re.sub(r'(?<!\*)\*([A-Za-z0-9_ \(\)\.\,\-\:\/\@\#]+?)\*(?!\*)', r'<b>\1</b>', t)
    t = re.sub(r'`([^`\n]+)`', r'<code>\1</code>', t)
    t = t.replace('***', '').replace('**', '').replace('*', '')
    # Kembalikan tag HTML yang dilindungi
    for key, val in placeholders.items():
        t = t.replace(key, val)
    return t


def send_telegram_message(chat_id: int, text: str, parse_mode: str = "HTML") -> bool:
    url = f"{TELEGRAM_API_URL}/sendMessage"
    formatted_text = format_to_telegram_html(text) if parse_mode == "HTML" else text
    payload = {
        "chat_id": chat_id,
        "text": formatted_text,
        "disable_web_page_preview": True
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode

    try:
        r = requests.post(url, json=payload, timeout=10)
        if r.status_code != 200:
            logger.warning(f"Telegram API response {r.status_code}: {r.text[:120]}. Fallback to clean plain text.")
            plain_clean = re.sub(r'<[^>]+>', '', formatted_text)
            plain_clean = plain_clean.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
            payload["text"] = plain_clean
            payload.pop("parse_mode", None)
            r = requests.post(url, json=payload, timeout=10)
        return r.status_code == 200
    except Exception as e:
        logger.error(f"Gagal kirim pesan ke chat {chat_id}: {e}")
        return False


def send_telegram_photo(chat_id: int, photo_path: str, caption: str = "") -> bool:
    url = f"{TELEGRAM_API_URL}/sendPhoto"
    if not os.path.exists(photo_path):
        logger.error(f"File photo tidak ditemukan: {photo_path}")
        return False
    try:
        with open(photo_path, "rb") as f:
            files = {"photo": f}
            data = {"chat_id": chat_id, "caption": caption}
            r = requests.post(url, data=data, files=files, timeout=30)
        return r.status_code == 200
    except Exception as e:
        logger.error(f"Gagal kirim foto ke {chat_id}: {e}")
        return False


def send_chat_action(chat_id: int, action: str = "typing"):
    url = f"{TELEGRAM_API_URL}/sendChatAction"
    try:
        requests.post(url, json={"chat_id": chat_id, "action": action}, timeout=5)
    except Exception:
        pass


# 3. Gemini AI Helper Function & Live Server Context Snapshot
SYSTEM_INSTRUCTION = """
Kamu adalah DepAs AI, asisten dan partner analisis data pribadi yang cerdas untuk Bossque dalam mengelola server pulsa Depo Cell (My Astaga! & OKIPAY).

PRINSIP KOMUNIKASI & PERSONALITAS:
1. PANGGILAN RESMI:
   - Sapa pimpinan HANYA dengan sebutan: "Bossque" (DILARANG KERAS menggunakan kata "Juragan").

2. KEMAMPUAN BERPIKIR, ANALISA & MEMBERI SARAN (AI COPILOT CERDAS):
   - Kamu adalah AI yang cerdas, analitis, dan memiliki kebebasan berpikir logis.
   - Jika Bossque bertanya saran, pandangan, rekomendasi, atau evaluasi (misal: "ADA saran apa nih?", "Gimana menurut lu?", "Apa yang perlu dibenahi?"):
     * ANALISA data transaksi, audit modul supplier, performa cabang/SCO, atau tren drop agen yang ada di snapshot.
     * Berikan observasi tajam, insight kritis, serta saran/rekomendasi taktis yang konkret dan berbasis data (data-driven).
     * Contoh: soroti modul supplier yang paling banyak gagal (seperti AMC), agen-agen yang drop signifikan untuk ditindaklanjuti tim SCO, atau cabang yang performanya perlu digenjot.
     * Tetap tempatkan Bossque sebagai pimpinan pemegang keputusan final dengan nada hormat dan solutif.

3. PERCAKAPAN LUWES & CHIT-CHAT (BASA-BASI / TEASING):
   - Jika Bossque menyapa ("halo", "hai", "pagi"), bercanda, merespon santai, atau mengetes ("masa ah?", "bisa lah?", "wkwk", "siap", "mantap"), balaslah secara cerdas, luwes, santai, dan bersahabat layaknya asisten pribadi yang tanggap.
   - DILARANG bersikap kaku seperti robot birokrasi, dan DILARANG menolak percakapan santai dengan kalimat template error!

4. PENYAJIAN DATA TRANSAKSI:
   - Jika Bossque meminta data atau laporan tertentu, sajikan datanya secara lugas, rapi, dan mudah dibaca di layar HP.
   - Gunakan format teks bersih. DILARANG menggunakan tanda bintang ganda (**) atau tripel (***).
   - Gunakan bullet point strip (-) atau simbol bulat (•).
   - DILARANG membuat tabel markdown pipa (| col |) karena berantakan di layar HP Telegram.

5. KEJUJURAN DATA (STRICT GROUNDING PADA FAKTA ANGKA):
   - Untuk data angka spesifik (omset, nominal, jumlah transaksi, tanggal, atau ID agen), selalu berpegang pada fakta snapshot resmi. Jangan mengarang angka transaksi fiktif.
   - Jika ada data spesifik historis yang memang tidak ada di snapshot, katakan dengan santun dan tawarkan data terdekat yang tersedia.
   - JANGAN PERNAH menolak obrolan santai atau sanggahan ("masa ah?") dengan alasan "data tidak tersedia"!

6. PENGUASAAN GARIS BESAR 8 MENU PILAR DEPO CELL (SLASH COMMANDS):
   Kamu menguasai fungsi, konteks bisnis, dan kaitan strategis dari 8 menu resmi berikut:
   • /summary (Laporan Eksekutif My Astaga!):
     - Memantau server retail utama: run-rate hit harian, omset, net profit bersih server, durasi speed telemetri, dan pertumbuhan MoM vs September.
   • /okipay (Laporan Eksekutif OKIPAY):
     - Memantau server kedua untuk transaksi H2H dan agen retail Okipay.
   • /sco (Manajemen & Kinerja Tim Sales Lapangan):
     - Mengevaluasi performa 5 sales fisik (Abdul Harris, Febri Kurniawan, Hupron, Khoirul Anan, Mas Komarjaya) vs agen Non-SCO dan Online. Memantau target kunjungan (visit), koleksi saldo piutang, dan pencapaian transaksi harian.
   • /cabang (Pemetaan 5 Cabang Server):
     - Memetakan dominasi transaksi di 4 cabang fisik (BSD, ICON, PP, PRG) dan 1 cabang ONLINE (PlayStore).
   • /supplier (Audit & Mitigasi Jalur Supplier Gagal):
     - Mengaudit kegagalan transaksi per modul supplier (AMC, MARKAZ, METRO, PCU, MR, CSK, dll) untuk evaluasi jalur tembak dan re-routing darurat.
   • /drop (Deteksi Dini Churn / Toko Macet):
     - Menyaring 10 toko/agen dengan penurunan transaksi harian terbesar untuk target penyelamatan (*rescue/coaching*) oleh tim sales.
   • /mitra (Database Basis 9.559 Reseller Aktif):
     - Memantau aset jaringan toko/agen terdaftar (>= 2023), kontak HP/WA terverifikasi, dan sebaran wilayah.
   • /server (Infrastruktur VPS & Kesiapan Teknis):
     - Menjaga stabilitas CPU, RAM, SSD, dan status ketiga background services (FastAPI, WA Gateway, Telebot).

   Jika Bossque menanyakan tentang menu, panduan, atau perbandingan antar sektor bisnis di atas, jelaskan secara cerdas, sistematis, dan hubungkan dengan data snapshot yang tersedia!
"""

def get_live_context_snapshot(prompt: str = "") -> str:
    """Mengambil snapshot ringkas data transaksi & server terkini untuk disuntikkan ke konteks AI."""
    lines = []
    data_path = os.path.join(BASE_DIR, "pages", "analisa", "data.json")
    if os.path.exists(data_path):
        try:
            with open(data_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            for brand in ["ASTAGA", "OKIPAY"]:
                bdata = raw_data.get(brand, {})
                periods = sorted([m for m in bdata.keys() if m.startswith("2026")], reverse=True)
                if periods:
                    curr_p = periods[0]
                    curr = bdata[curr_p]
                    daily_list = curr.get("daily", [])
                    last_date = daily_list[-1].get("date") if daily_list else curr_p
                    days = curr.get("days_count", 0)
                    daily_trx = curr.get("daily_trx", 0)
                    cust = curr.get("daily_customers", 0)
                    sukses = curr.get("sukses_pct", 0)
                    speed = curr.get("avg_dur_str", "00:00")
                    lines.append(f"[{brand}] Periode {curr_p} | Data Cut-off s/d {last_date} ({days} hari kalender MTD)")
                    lines.append(f"  • Run-rate Harian: {daily_trx:,} trx/hari (Total Sukses MTD: {curr.get('trx_sukses', 0):,} trx)")
                    lines.append(f"  • Member Aktif: {cust:,} reseller/hari | % Sukses: {sukses}% | Speed: {speed}")
                    branches = curr.get("branches", {})
                    if branches:
                        br_str = ", ".join([f"{k}: {v:,} trx" for k, v in sorted(branches.items(), key=lambda x: x[1], reverse=True)])
                        lines.append(f"  • Performa Cabang (Total MTD): {br_str}")
        except Exception as e:
            logger.error(f"Error reading live context snapshot: {e}")

    db_path = os.path.join(BASE_DIR, "MASTER", "master_data.db")
    if os.path.exists(db_path):
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("SELECT count(*) FROM resellers")
            total_rs = c.fetchone()[0]
            c.execute("SELECT count(*) FROM reseller_contacts")
            total_contacts = c.fetchone()[0]
            conn.close()
            lines.append(f"[DATABASE RESELLER] Total mitra aktif (>= 2023): {total_rs:,} akun | Kontak terverifikasi: {total_contacts:,}")
        except Exception:
            pass

    # 3. Data Performa Sales SCO, Kategori, dan Tren Agen dari pages/sco/data_sco.json
    sco_path = os.path.join(BASE_DIR, "pages", "sco", "data_sco.json")
    if os.path.exists(sco_path):
        try:
            with open(sco_path, "r", encoding="utf-8") as f:
                sco_data = json.load(f)

            # --- A. PERFORMA TIM SALES CABANG (SCO) & RANKING GROWTH ---
            p_latest = sco_data.get("periods", {}).get(sco_data.get("latest_period", "1026"), {})
            idx_list = p_latest.get("index", [])
            cutoff_sco = p_latest.get("cutoff_date") or sco_data.get("cutoff_date", "20-10-2026")

            sales_rows = [x for x in idx_list if x.get("CABANG") and x.get("SCO") not in ["NON SCO", "ONLINE"]]
            if sales_rows:
                sorted_sales = sorted(sales_rows, key=lambda x: x.get("%", 0), reverse=True)
                lines.append(f"\n[PERFORMA TIM SALES CABANG (SCO) - CUTOFF: {cutoff_sco} (OKTOBER 2026 MTD VS SEPTEMBER)]:")
                lines.append("Peringkat Growth Harian 5 Sales SCO (Tertinggi ke Terendah):")
                for rank, s in enumerate(sorted_sales, 1):
                    s_name = s.get("SCO", "-")
                    s_cb = s.get("CABANG", "-")
                    s_prev = s.get("prev", 0)
                    s_curr = s.get("curr", 0)
                    s_diff = s.get("Growth", 0)
                    s_diff_str = f"+{s_diff:.1f}" if s_diff > 0 else f"{s_diff:.1f}"
                    s_pct = s.get("%", 0) * 100
                    s_pct_str = f"+{s_pct:.1f}%" if s_pct > 0 else f"{s_pct:.1f}%"
                    notes = ""
                    if rank == 1 and s_diff > 0:
                        notes = " -> [GROWTH TERTINGGI / SATU-SATUNYA POSITIF]"
                    elif rank == len(sorted_sales):
                        notes = " -> [GROWTH TERENDAH / PENURUNAN TERDALAM]"
                    lines.append(f"  {rank}. {s_name} ({s_cb}) | Sep: {s_prev:,.1f}/hari -> Oct: {s_curr:,.1f}/hari (Diff: {s_diff_str}/hari | {s_pct_str}){notes}")

            # Kategori Saluran (SCO / NON SCO / ONLINE / Grand Total)
            cat_rows = [x for x in idx_list if x.get("SCO") in ["TOTAL SCO", "TOTAL NON SCO", "ONLINE", "Grand Total"]]
            if cat_rows:
                lines.append("\nRingkasan Saluran Penjualan:")
                for c in cat_rows:
                    c_name = c.get("SCO", "-")
                    c_prev = c.get("prev", 0)
                    c_curr = c.get("curr", 0)
                    c_diff = c.get("Growth", 0)
                    c_diff_str = f"+{c_diff:.1f}" if c_diff > 0 else f"{c_diff:.1f}"
                    c_pct = c.get("%", 0) * 100
                    c_pct_str = f"+{c_pct:.1f}%" if c_pct > 0 else f"{c_pct:.1f}%"
                    lines.append(f"  • {c_name}: {c_curr:,.1f}/hari (Sep: {c_prev:,.1f} | {c_diff_str} / {c_pct_str})")

            # Data Historis KPI SCO Resmi (Final September)
            kpi_list = sco_data.get("kpi_sco", [])
            if kpi_list:
                latest_kpi_m = sorted(list(set(x.get("bulan", "") for x in kpi_list)))[-1]
                m_records = [x for x in kpi_list if x.get("bulan") == latest_kpi_m]
                if m_records:
                    lines.append(f"\n[DATA HISTORIS KPI RESMI & INSENTIF SALES (FINAL {latest_kpi_m})]:")
                    for k in sorted(m_records, key=lambda x: x.get("score", 0), reverse=True):
                        lines.append(f"  • {k.get('nama')}: Skor KPI {k.get('score', 0):.1f}% | Insentif Rp {k.get('insentif', 0):,.0f} (Ach Visit: {k.get('pct_visit', 0)}%, Coll: {k.get('pct_coll', 0)}%, Trx: {k.get('pct_trx', 0)}%)")

            # --- B. TOP DROP & TOP GROWTH AGEN ---
            tren_all = sco_data.get("tren_agen", [])
            tren = [x for x in tren_all if x.get("avg_prev", 0) >= 5 or x.get("avg_curr", 0) >= 5]

            # Top 10 Drop
            sorted_drop = sorted(tren, key=lambda x: x.get("diff", 0))
            if sorted_drop:
                lines.append("\n[DAFTAR 10 AGEN DENGAN PENURUNAN / DROP HARIAN TERBESAR (OKTOBER 2026 VS SEPTEMBER)]:")
                for i, a in enumerate(sorted_drop[:10], 1):
                    aid = a.get("aid", "-")
                    name = a.get("name", "-")
                    cb = a.get("cabang", "-")
                    p = a.get("avg_prev", 0)
                    c = a.get("avg_curr", 0)
                    diff = round(a.get("diff", 0), 1)
                    pct = round(a.get("growth", 0) * 100, 1)
                    lines.append(f"  {i}. [{aid}] {name} ({cb}) | Run-rate: {p}/hari -> {c}/hari (Drop: {diff}/hari | {pct}%)")

            # Top 10 Growth
            sorted_growth = sorted(tren, key=lambda x: x.get("diff", 0), reverse=True)
            if sorted_growth:
                lines.append("\n[DAFTAR 10 AGEN DENGAN PERTUMBUHAN / KENAIKAN HARIAN TERTINGGI (OKTOBER 2026 VS SEPTEMBER)]:")
                for i, a in enumerate(sorted_growth[:10], 1):
                    aid = a.get("aid", "-")
                    name = a.get("name", "-")
                    cb = a.get("cabang", "-")
                    p = a.get("avg_prev", 0)
                    c = a.get("avg_curr", 0)
                    diff = round(a.get("diff", 0), 1)
                    pct = round(a.get("growth", 0) * 100, 1)
                    lines.append(f"  {i}. [{aid}] {name} ({cb}) | Run-rate: {p}/hari -> {c}/hari (Naik: +{diff}/hari | +{pct}%)")

            # Spesifik Agen Lookup jika disebut dalam prompt
            if prompt:
                import re
                found_ids = [x.upper() for x in re.findall(r'(?:AR|OP)\d{4,5}', prompt, re.IGNORECASE)]
                matched_agents = [a for a in tren_all if a.get("aid", "").upper() in found_ids]

                if not matched_agents:
                    STOPWORDS = {
                        'CELL', 'CELLULAR', 'PULSA', 'KONTER', 'COUNTER', 'GIMANA', 'BAGAIMANA',
                        'PERFORMA', 'TOKO', 'BULAN', 'HARI', 'TRANSAKSI', 'BERAPA', 'SAYA', 'AGEN',
                        'YANG', 'INFO', 'TOLONG', 'CEK', 'DONG', 'COBA', 'SIAPA', 'MANA', 'BISA',
                        'KIRA', 'KASIH', 'LIHAT', 'TULIS', 'TULISKAN', 'DENGAN', 'UNTUK', 'DARI'
                    }
                    words = [w.upper() for w in re.findall(r'\b[A-Za-z0-9]{4,}\b', prompt) if w.upper() not in STOPWORDS]
                    if words:
                        for a in tren_all:
                            aname = a.get("name", "").upper()
                            if any(k in aname for k in words):
                                matched_agents.append(a)
                                if len(matched_agents) >= 3:
                                    break

                if matched_agents:
                    lines.append("\n[DETAIL DATA AGEN TERKAIT PERTANYAAN USER]:")
                    for a in matched_agents[:3]:
                        m_hist = ", ".join([f"{k}: {v}" for k, v in a.get("monthly", {}).items()])
                        lines.append(
                            f"  • ID: {a.get('aid')} | Nama: {a.get('name')} | Cabang: {a.get('cabang')} | SCO: {a.get('sco')} | Tipe: {a.get('type')}\n"
                            f"    Run-rate Sep: {a.get('avg_prev')}/hari -> Oct: {a.get('avg_curr')}/hari (Diff: {a.get('diff')}/hari)\n"
                            f"    Riwayat Run-rate Bulanan: {m_hist}"
                        )
        except Exception as e:
            logger.error(f"Error reading tren_agen from data_sco.json: {e}")

    # 4. Data Modul Supplier Gagal dari top_bottom_agen.json
    tb_path = os.path.join(BASE_DIR, "pages", "analisa", "top_bottom_agen.json")
    if os.path.exists(tb_path):
        try:
            with open(tb_path, "r", encoding="utf-8") as f:
                tb_data = json.load(f)
            for brand in ["ASTAGA", "OKIPAY"]:
                binfo = tb_data.get(brand, {})
                fails = binfo.get("top_failed_modules", [])
                if fails:
                    fail_str = ", ".join([f"{x['module']}: {x['failed']} gagal" for x in fails[:5]])
                    lines.append(f"[{brand} AUDIT SUPPLIER] Modul Paling Banyak Gagal (MTD Oktober 2026): {fail_str}")
        except Exception as e:
            logger.error(f"Error reading top_failed_modules: {e}")

    return "\n".join(lines)


# In-memory session history untuk percakapan multi-turn yang nyambung & kontekstual
USER_SESSIONS = {}

def ask_gemini(prompt: str, chat_id: int = 0) -> str:
    if not GEMINI_API_KEY:
        return "Mohon maaf Bossque, GEMINI_API_KEY belum dikonfigurasi di server."

    live_context = get_live_context_snapshot(prompt)
    system_instruction_full = f"""{SYSTEM_INSTRUCTION}

KONTEKS DATA RESMI SERVER DEPAS SAAT INI (REAL-TIME SNAPSHOT):
{live_context}

PETUNJUK EKSEKUSI:
- Gunakan data resmi di atas untuk menjawab pertanyaan dan memberikan analisa cerdas kepada Bossque.
- Pahami riwayat percakapan sebelumnya agar obrolan mengalir luwes, nyambung, dan solutif.
"""

    models = [
        "gemini-flash-lite-latest",
        "gemini-3-flash-preview",
        "gemini-flash-latest",
        "gemini-3.5-flash",
        "gemini-3.8-flash"
    ]

    # Ambil riwayat percakapan sesi chat user
    history = list(USER_SESSIONS.get(chat_id, [])) if chat_id else []
    history.append({"role": "user", "parts": [{"text": prompt}]})

    payload = {
        "system_instruction": {
            "parts": [{"text": system_instruction_full}]
        },
        "contents": history,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 1024
        }
    }

    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
        try:
            resp = requests.post(url, json=payload, timeout=25)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    reply = candidates[0]["content"]["parts"][0]["text"].strip()
                    if chat_id:
                        history.append({"role": "model", "parts": [{"text": reply}]})
                        # Simpan maksimal 8 giliran terakhir (4 pasang tanya-jawab)
                        USER_SESSIONS[chat_id] = history[-8:]
                    return reply
            else:
                logger.warning(f"Model {model} returned {resp.status_code}: {resp.text[:100]}")
                if resp.status_code in [429, 503]:
                    time.sleep(0.5)
        except Exception as e:
            logger.warning(f"Error calling {model}: {e}")

    return "Maaf Bossque, AI sedang mengalami lonjakan trafik sementara dari Google. Silakan ketik pertanyaan lagi ya!"


# 4. Command Handlers

# =====================================================================
# MENU COMMAND HANDLERS (RESMI, INSTAN, DATA 100% VALID)
# =====================================================================

def register_telegram_commands():
    """Mendaftarkan menu tombol resmi Telegram [ Menu = ] ke API."""
    url = f"{TELEGRAM_API_URL}/setMyCommands"
    commands = [
        {"command": "summary", "description": "Laporan Visual & Run-rate My Astaga"},
        {"command": "okipay", "description": "Laporan Visual & Run-rate OKIPAY"},
        {"command": "sco", "description": "Laporan Visual Rekap Sales Cabang (SCO)"},
        {"command": "cabang", "description": "Performa Cabang BSD, ICON, PP, PRG, ONLINE"},
        {"command": "supplier", "description": "Audit Modul Supplier Paling Banyak Gagal"},
        {"command": "drop", "description": "10 Agen dengan Penurunan Transaksi Terbesar"},
        {"command": "mitra", "description": "Total Reseller Aktif & Kontak Terverifikasi"},
        {"command": "server", "description": "Status Kesehatan VPS (RAM, CPU, Disk)"},
        {"command": "help", "description": "Panduan dan Bantuan Penggunaan"}
    ]
    try:
        requests.post(url, json={"commands": commands}, timeout=10)
    except Exception as e:
        logger.warning(f"Gagal register menu commands: {e}")


def handle_command_start(chat_id: int, user_first_name: str):
    welcome_text = (
        f"Halo Bossque <b>{user_first_name}</b>! 👋\n\n"
        f"Saya <b>DepAs AI Reader</b> (@depas_ai_bot), asisten data transaksi resmi server Depo Cell (My Astaga! & OKIPAY).\n\n"
        f"📌 <b>Menu Cepat (Klik Menu di kiri bawah keyboard):</b>\n"
        f"• /summary - Laporan Visual & Run-rate My Astaga\n"
        f"• /okipay - Laporan Visual & Run-rate OKIPAY\n• /sco - Laporan Visual Rekap Sales Cabang (SCO)\n"
        f"• /cabang - Performa Cabang (BSD, ICON, PP, PRG, ONLINE)\n"
        f"• /supplier - Audit Modul Supplier Paling Banyak Gagal\n"
        f"• /drop - 10 Agen Penurunan Transaksi Terbesar\n"
        f"• /mitra - Total Reseller Aktif & Kontak Database\n"
        f"• /server - Kesehatan Mesin VPS (RAM, CPU, SSD)\n\n"
        f"💡 Bossque juga bisa langsung tanya bebas apa saja seputar data transaksi server!"
    )
    send_telegram_message(chat_id, welcome_text)


def handle_command_summary(chat_id: int, text: str = ""):
    send_chat_action(chat_id, "upload_photo")
    img_path = os.path.join(BASE_DIR, "Daily_Report_ASTAGA_2026-10.png")
    data_json_path = os.path.join(BASE_DIR, "pages", "analisa", "data.json")

    caption = "📊 Laporan Visual Harian My Astaga! (MTD Oktober 2026)"
    if os.path.exists(img_path):
        send_telegram_photo(chat_id, img_path, caption=caption)

    # Tambahkan rekap teks cepat
    if os.path.exists(data_json_path):
        try:
            with open(data_json_path, "r", encoding="utf-8") as f:
                d = json.load(f).get("ASTAGA", {}).get("2026-10", {})
            daily_trx = d.get("daily_trx", 0)
            total_sukses = d.get("trx_sukses", 0)
            days = d.get("days_count", 20)
            speed = d.get("avg_dur_str", "00:00")
            sukses_pct = d.get("sukses_pct", 0)
            member = d.get("daily_customers", 0)
            msg = (
                f"⚡ <b>RINGKASAN METRIK MY ASTAGA (OKTOBER 2026 MTD):</b>\n"
                f"- Cut-off: s/d 20 Oktober 2026 ({days} hari kalender)\n"
                f"- Run-rate Harian: {daily_trx:,} trx/hari\n"
                f"- Total Sukses MTD: {total_sukses:,} trx\n"
                f"- Member Aktif: {member:,} reseller/hari\n"
                f"- Success Rate: {sukses_pct}% | Avg Speed: {speed}"
            )
            send_telegram_message(chat_id, msg)
        except Exception:
            pass


def handle_command_okipay(chat_id: int):
    send_chat_action(chat_id, "upload_photo")
    img_path = os.path.join(BASE_DIR, "Daily_Report_OKIPAY_2026-10.png")
    data_json_path = os.path.join(BASE_DIR, "pages", "analisa", "data.json")

    caption = "📊 Laporan Visual Harian OKIPAY (MTD Oktober 2026)"
    if os.path.exists(img_path):
        send_telegram_photo(chat_id, img_path, caption=caption)

    if os.path.exists(data_json_path):
        try:
            with open(data_json_path, "r", encoding="utf-8") as f:
                d = json.load(f).get("OKIPAY", {}).get("2026-10", {})
            daily_trx = d.get("daily_trx", 0)
            total_sukses = d.get("trx_sukses", 0)
            days = d.get("days_count", 19)
            speed = d.get("avg_dur_str", "00:00")
            sukses_pct = d.get("sukses_pct", 0)
            member = d.get("daily_customers", 0)
            msg = (
                f"⚡ <b>RINGKASAN METRIK OKIPAY (OKTOBER 2026 MTD):</b>\n"
                f"- Cut-off: s/d 19 Oktober 2026 ({days} hari kalender)\n"
                f"- Run-rate Harian: {daily_trx:,} trx/hari\n"
                f"- Total Sukses MTD: {total_sukses:,} trx\n"
                f"- Member Aktif: {member:,} reseller/hari\n"
                f"- Success Rate: {sukses_pct}% | Avg Speed: {speed}"
            )
            send_telegram_message(chat_id, msg)
        except Exception:
            pass


def handle_command_sco(chat_id: int):
    send_chat_action(chat_id, "upload_photo")
    import glob
    pattern = os.path.join(BASE_DIR, "Laporan_SCO_*.png")
    sco_files = sorted(glob.glob(pattern), reverse=True)
    img_path = sco_files[0] if sco_files else os.path.join(BASE_DIR, "Laporan_SCO_2026-10-21.png")

    caption = "📊 Laporan Potret Rekap Kinerja Sales Cabang (SCO)"
    if os.path.exists(img_path):
        send_telegram_photo(chat_id, img_path, caption=caption)
    else:
        send_telegram_message(chat_id, "Foto laporan SCO belum tersedia di server.")

    # Tambahkan ringkasan SCO
    data_sco_path = os.path.join(BASE_DIR, "pages", "sco", "data_sco.json")
    if os.path.exists(data_sco_path):
        try:
            with open(data_sco_path, "r", encoding="utf-8") as f:
                d = json.load(f)
            cutoff = d.get("cutoff_date", "20-10-2026")
            p = d.get("periods", {}).get(d.get("latest_period", "1026"), {})
            idx = p.get("index", [])
            lines = [f"📋 <b>REKAP SALES CABANG (SCO) - CUTOFF: {cutoff}</b>\n"]
            for item in idx:
                s_name = item.get("SCO")
                if s_name in ["TOTAL SCO", "TOTAL NON SCO", "ONLINE", "Grand Total"]:
                    curr = item.get("curr", 0)
                    prev = item.get("prev", 0)
                    diff = item.get("Growth", 0)
                    diff_sign = f"+{diff:.1f}" if diff > 0 else f"{diff:.1f}"
                    pct = item.get("%", 0) * 100
                    pct_sign = f"+{pct:.1f}%" if pct > 0 else f"{pct:.1f}%"
                    lines.append(f"• <b>{s_name}</b>: {curr:,.1f}/hari (Sep: {prev:,.1f} | {diff_sign} / {pct_sign})")
            lines.append("\n<i>Gambar di atas adalah potret jernih HD terbaru (Cutoff: 20-10-2026) siap forward ke WhatsApp.</i>")
            send_telegram_message(chat_id, "\n".join(lines))
        except Exception as e:
            logger.error(f"Error sending sco text summary: {e}")


def handle_command_cabang(chat_id: int):
    send_chat_action(chat_id, "typing")
    data_json_path = os.path.join(BASE_DIR, "pages", "analisa", "data.json")
    if not os.path.exists(data_json_path):
        send_telegram_message(chat_id, "Mohon maaf Bossque, data cabang belum tersedia.")
        return

    try:
        with open(data_json_path, "r", encoding="utf-8") as f:
            raw = json.load(f)

        lines = ["🏢 <b>PERFORMA TRANSAKSI CABANG (MTD OKTOBER 2026):</b>\n"]

        for brand in ["ASTAGA", "OKIPAY"]:
            bdata = raw.get(brand, {}).get("2026-10", {})
            branches = bdata.get("branches", {})
            days = bdata.get("days_count", 20)
            if branches:
                lines.append(f"<b>[{brand}] (Cut-off {days} Hari):</b>")
                for br, tot in sorted(branches.items(), key=lambda x: x[1], reverse=True):
                    daily = round(tot / days) if days > 0 else 0
                    lines.append(f"- {br}: {daily:,} trx/hari (Total: {tot:,} trx)")
                lines.append("")

        send_telegram_message(chat_id, "\n".join(lines).strip())
    except Exception as e:
        send_telegram_message(chat_id, f"Gagal membaca data cabang: {e}")


def handle_command_supplier(chat_id: int):
    send_chat_action(chat_id, "typing")
    tb_path = os.path.join(BASE_DIR, "pages", "analisa", "top_bottom_agen.json")
    if not os.path.exists(tb_path):
        send_telegram_message(chat_id, "Mohon maaf Bossque, data modul supplier belum tersedia.")
        return

    try:
        with open(tb_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        lines = ["⚠️ <b>AUDIT MODUL SUPPLIER PALING BANYAK GAGAL (MTD OKTOBER 2026):</b>\n"]
        for brand in ["ASTAGA", "OKIPAY"]:
            fails = data.get(brand, {}).get("top_failed_modules", [])
            if fails:
                lines.append(f"<b>Server {brand}:</b>")
                for item in fails:
                    lines.append(f"- {item['module']}: {item['failed']:,} transaksi gagal")
                lines.append("")

        lines.append("<i>Catatan: Modul AMC menjadi sumber kegagalan transaksi nomor satu di kedua server.</i>")
        send_telegram_message(chat_id, "\n".join(lines))
    except Exception as e:
        send_telegram_message(chat_id, f"Gagal membaca data supplier: {e}")


def handle_command_drop(chat_id: int):
    send_chat_action(chat_id, "typing")
    tb_path = os.path.join(BASE_DIR, "pages", "analisa", "top_bottom_agen.json")
    if not os.path.exists(tb_path):
        send_telegram_message(chat_id, "Mohon maaf Bossque, data agen drop belum tersedia.")
        return

    try:
        with open(tb_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        top_drop = data.get("ASTAGA", {}).get("top_drop", [])
        if not top_drop:
            send_telegram_message(chat_id, "Data agen drop belum terdata.")
            return

        lines = ["📉 <b>10 AGEN DENGAN PENURUNAN HARIAN TERBESAR (ASTAGA MTD OKTOBER):</b>\n"]
        for i, a in enumerate(top_drop[:10], 1):
            lines.append(
                f"{i}. <b>[{a['agen_id']}] {a['name']}</b> ({a['cabang']})\n"
                f"   • Run-rate: {a['daily_prev']:.1f} ➔ {a['daily_curr']:.1f} trx/hari\n"
                f"   • Penurunan: {a['drop_daily']:.1f}/hari ({a['drop_pct']}%) | Total MTD: {a['mtd_trx']:,} trx"
            )

        send_telegram_message(chat_id, "\n".join(lines))
    except Exception as e:
        send_telegram_message(chat_id, f"Gagal membaca data drop: {e}")


def handle_command_mitra(chat_id: int):
    send_chat_action(chat_id, "typing")
    db_path = os.path.join(BASE_DIR, "MASTER", "master_data.db")
    if not os.path.exists(db_path):
        send_telegram_message(chat_id, "Database master belum tersedia.")
        return

    try:
        import sqlite3
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT count(*) FROM resellers")
        total_rs = c.fetchone()[0]
        c.execute("SELECT count(*) FROM reseller_contacts")
        total_contacts = c.fetchone()[0]

        # Hitung per cabang
        c.execute("SELECT cabang, count(*) FROM resellers GROUP BY cabang ORDER BY count(*) DESC")
        cabang_rows = c.fetchall()
        conn.close()

        lines = [
            f"👥 <b>DATABASE MITRA RESELLER AKTIF (>= 2023):</b>\n",
            f"- Total Mitra Terdaftar: <b>{total_rs:,}</b> akun",
            f"- Kontak Terverifikasi WA: <b>{total_contacts:,}</b> nomor HP\n",
            f"<b>Penyebaran Mitra per Cabang:</b>"
        ]
        for cb, cnt in cabang_rows:
            lines.append(f"- {cb}: {cnt:,} reseller")

        send_telegram_message(chat_id, "\n".join(lines))
    except Exception as e:
        send_telegram_message(chat_id, f"Gagal membaca data mitra: {e}")


def handle_user_chat(chat_id: int, user_text: str):
    lower_text = user_text.lower()
    
    # Deteksi permintaan gambar / chart / foto
    if any(k in lower_text for k in ["gambar", "foto", "grafik", "chart", "infografis", "tabel visual"]):
        send_chat_action(chat_id, "upload_photo")
        if "okipay" in lower_text:
            img_path = os.path.join(BASE_DIR, "Daily_Report_OKIPAY_2026-10.png")
            brand = "OKIPAY"
        else:
            img_path = os.path.join(BASE_DIR, "Daily_Report_ASTAGA_2026-10.png")
            brand = "MY ASTAGA!"
        
        if os.path.exists(img_path):
            send_telegram_photo(chat_id, img_path, caption=f"📊 Laporan Visual Harian {brand} (Oktober 2026 MTD)")
            return

    send_chat_action(chat_id, "typing")
    reply = ask_gemini(user_text, chat_id=chat_id)
    send_telegram_message(chat_id, reply)


# 5. Main Polling Loop
def main():
    logger.info("Memulai DepAs AI Telegram Bot (@depas_ai_bot)...")
    offset = 0

    # Pastikan koneksi ke Telegram API sukses
    try:
        r = requests.get(f"{TELEGRAM_API_URL}/getMe", timeout=10)
        bot_info = r.json()
        if not bot_info.get("ok"):
            logger.error(f"Gagal login Telegram Bot: {bot_info}")
            return
        bot_name = bot_info["result"]["username"]
        logger.info(f"Bot AKTIF & TERHUBUNG: @{bot_name}")
    except Exception as e:
        logger.error(f"Koneksi awal ke Telegram API gagal: {e}")
        return

    logger.info("Mulai mendengarkan pesan masuk (Long Polling)...")

    while True:
        try:
            url = f"{TELEGRAM_API_URL}/getUpdates?offset={offset}&timeout=30"
            resp = requests.get(url, timeout=40)
            if resp.status_code != 200:
                time.sleep(2)
                continue

            data = resp.json()
            if not data.get("ok"):
                time.sleep(2)
                continue

            updates = data.get("result", [])
            for u in updates:
                offset = u["update_id"] + 1

                msg = u.get("message")
                if not msg:
                    continue

                chat = msg.get("chat", {})
                chat_id = chat.get("id")
                from_user = msg.get("from", {})
                first_name = from_user.get("first_name", "Bossque")
                text = msg.get("text", "").strip()

                if not text:
                    continue

                logger.info(f"Pesan dari [{first_name} | {chat_id}]: {text}")

                # Routing Command
                cmd = text.split()[0].lower()
                if cmd in ("/start", "/help"):
                    handle_command_start(chat_id, first_name)
                elif cmd in ("/summary", "/astaga", "/laporan"):
                    handle_command_summary(chat_id, text)
                elif cmd in ("/okipay", "/oki"):
                    handle_command_okipay(chat_id)
                elif cmd in ("/sco", "/sales"):
                    handle_command_sco(chat_id)
                elif cmd in ("/cabang", "/branch"):
                    handle_command_cabang(chat_id)
                elif cmd in ("/supplier", "/modul"):
                    handle_command_supplier(chat_id)
                elif cmd in ("/drop", "/churn"):
                    handle_command_drop(chat_id)
                elif cmd in ("/mitra", "/reseller", "/agen"):
                    handle_command_mitra(chat_id)
                elif cmd in ("/server", "/status"):
                    handle_command_server(chat_id)
                else:
                    handle_user_chat(chat_id, text)

        except requests.exceptions.Timeout:
            continue
        except requests.exceptions.ConnectionError:
            logger.warning("Koneksi Telegram terputus sementara, mencoba kembali...")
            time.sleep(5)
        except Exception as e:
            logger.error(f"Error di loop polling: {e}")
            time.sleep(3)


if __name__ == "__main__":
    main()
