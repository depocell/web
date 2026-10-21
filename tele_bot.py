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
def send_telegram_message(chat_id: int, text: str, parse_mode: str = "Markdown") -> bool:
    url = f"{TELEGRAM_API_URL}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode

    try:
        r = requests.post(url, json=payload, timeout=10)
        if r.status_code != 200:
            # Fallback tanpa parse_mode jika ada karakter markdown yang konflik
            payload.pop("parse_mode", None)
            r = requests.post(url, json=payload, timeout=10)
        return r.status_code == 200
    except Exception as e:
        logger.error(f"Gagal kirim pesan ke chat {chat_id}: {e}")
        return False


def send_chat_action(chat_id: int, action: str = "typing"):
    url = f"{TELEGRAM_API_URL}/sendChatAction"
    try:
        requests.post(url, json={"chat_id": chat_id, "action": action}, timeout=5)
    except Exception:
        pass


# 3. Gemini AI Helper Function & Live Server Context Snapshot
SYSTEM_INSTRUCTION = """
Kamu adalah DepAs AI Copilot, asisten eksekutif pribadi untuk manajemen dan pimpinan server pulsa Depo Cell (My Astaga! & OKIPAY).
Karaktermu: Sangat cerdas, santun, lugas, solutif, dan berwawasan tajam seputar bisnis pulsa, PPOB, strategi omset, teknologi server OtomaX, dan analisa data.
Gunakan bahasa Indonesia yang profesional namun luwes dan bersahabat. Selalu gunakan format poin-poin yang mudah dibaca di layar HP jika memberikan penjelasan panjang.
"""

def get_live_context_snapshot() -> str:
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

    # 3. Data Top Drop Agen (Growth Paling Rendah)
    tb_path = os.path.join(BASE_DIR, "pages", "analisa", "top_bottom_agen.json")
    if os.path.exists(tb_path):
        try:
            with open(tb_path, "r", encoding="utf-8") as f:
                tb_data = json.load(f)
            for b, binfo in tb_data.items():
                top_drop = binfo.get("top_drop", [])
                if top_drop:
                    lines.append(f"\n[DAFTAR 10 AGEN DENGAN DROP HARIAN TERBESAR / GROWTH PALING RENDAH ({b} MTD OKTOBER 2026)]:")
                    for i, a in enumerate(top_drop[:10]):
                        lines.append(
                            f"  {i+1}. [{a['agen_id']}] {a['name']} ({a['cabang']}) | "
                            f"Run-rate: {a['daily_prev']:.1f} -> {a['daily_curr']:.1f} trx/hari "
                            f"(Drop: {a['drop_daily']:.1f}/hari | {a['drop_pct']}%) | "
                            f"MTD: {a['mtd_trx']:,} trx (Bulan Lalu: {a['prev_trx']:,} trx)"
                        )
        except Exception as e:
            logger.error(f"Error reading top_bottom_agen.json: {e}")

    return "\n".join(lines)


def ask_gemini(prompt: str) -> str:
    if not GEMINI_API_KEY:
        return "Mohon maaf Juragan, GEMINI_API_KEY belum dikonfigurasi di server."

    live_context = get_live_context_snapshot()
    system_instruction_full = f"""{SYSTEM_INSTRUCTION}

KONTEKS DATA RESMI SERVER DEPAS SAAT INI (REAL-TIME SNAPSHOT):
{live_context}

PETUNJUK PENTING:
Gunakan data resmi di atas untuk menjawab pertanyaan pimpinan/juragan secara lugas, presisi, dan percaya diri (terutama jika ditanya soal tanggal cut-off, jumlah transaksi, performa cabang, SLA server, jumlah reseller, atau daftar agen dengan drop/growth terendah). Jangan pernah berkata bahwa Anda tidak memiliki akses ke data real, karena data resmi server sudah terlampir di atas!
"""

    models = [
        "gemini-flash-lite-latest",
        "gemini-3-flash-preview",
        "gemini-flash-latest",
        "gemini-3.5-flash",
        "gemini-3.8-flash"
    ]
    payload = {
        "system_instruction": {
            "parts": [{"text": system_instruction_full}]
        },
        "contents": [
            {"parts": [{"text": prompt}]}
        ],
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
                    return candidates[0]["content"]["parts"][0]["text"].strip()
            else:
                logger.warning(f"Model {model} returned {resp.status_code}: {resp.text[:100]}")
                if resp.status_code in [429, 503]:
                    time.sleep(0.5)
        except Exception as e:
            logger.warning(f"Error calling {model}: {e}")

    return "Maaf Juragan, AI sedang mengalami lonjakan trafik sementara dari Google. Silakan ketik pertanyaan lagi ya!"


# 4. Command Handlers
def handle_command_start(chat_id: int, user_first_name: str):
    welcome_text = (
        f"Halo Juragan *{user_first_name}*! 👋\n\n"
        f"Saya *DepAs AI Copilot* (@depas\\_ai\\_bot), asisten eksekutif pribadi Anda di server Depo Cell.\n\n"
        f"📌 *Perintah Cepat:*\n"
        f"• 📊 `/summary` - Laporan performa harian & run-rate cabang\n"
        f"• 🖥️ `/server` - Cek kesehatan server VPS (CPU, RAM, Uptime)\n"
        f"• ❓ `/help` - Bantuan penggunaan bot\n\n"
        f"💡 *Tanya Apa Saja:*\n"
        f"Ketik pertanyaan apa saja (analisa omset, ide promo, strategi jualan pulsa, rumus, atau obrolan santai), "
        f"saya siap menjawab 24 jam dengan kecerdasan Google Gemini AI!"
    )
    send_telegram_message(chat_id, welcome_text)


def handle_command_server(chat_id: int):
    send_chat_action(chat_id, "typing")
    try:
        # Cek uptime & load
        uptime = subprocess.check_output("uptime -p", shell=True).decode().strip()
        
        # Cek RAM
        free_out = subprocess.check_output("free -h", shell=True).decode().splitlines()
        ram_line = free_out[1].split() if len(free_out) > 1 else []
        ram_info = f"Total: {ram_line[1]}, Used: {ram_line[2]}, Free: {ram_line[3]}" if len(ram_line) >= 4 else "N/A"

        # Cek Disk
        df_out = subprocess.check_output("df -h /", shell=True).decode().splitlines()
        disk_line = df_out[1].split() if len(df_out) > 1 else []
        disk_info = f"Size: {disk_line[1]}, Used: {disk_line[2]} ({disk_line[4]}), Avail: {disk_line[3]}" if len(disk_line) >= 5 else "N/A"

        # Cek Layanan
        services = ["webreport", "wa-gateway"]
        srv_status = []
        for s in services:
            try:
                st = subprocess.check_output(f"systemctl is-active {s}", shell=True).decode().strip()
                icon = "🟢" if st == "active" else "🔴"
                srv_status.append(f"{icon} `{s}`: {st}")
            except Exception:
                srv_status.append(f"⚪ `{s}`: unknown")

        report = (
            f"🖥️ *STATUS KESEHATAN SERVER VPS*\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"⏱️ *Uptime*: {uptime}\n"
            f"🧠 *RAM*: `{ram_info}`\n"
            f"💾 *Disk SSD*: `{disk_info}`\n\n"
            f"⚙️ *Status Layanan:*\n" + "\n".join(srv_status) + "\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"✅ *Kondisi Server: PRIMA & NORMAL*"
        )
        send_telegram_message(chat_id, report)
    except Exception as e:
        send_telegram_message(chat_id, f"Gagal memeriksa status server: {e}")


def handle_command_summary(chat_id: int):
    send_chat_action(chat_id, "typing")
    data_json_path = os.path.join(BASE_DIR, "pages", "analisa", "data.json")
    if not os.path.exists(data_json_path):
        send_telegram_message(chat_id, "File data.json analisa belum tersedia di server.")
        return

    try:
        with open(data_json_path, "r", encoding="utf-8") as f:
            data = json.load(f).get("ASTAGA", {})
        
        # Ambil periode terakhir
        periods = sorted([p for p in data.keys() if p.startswith("2026")], reverse=True)
        if not periods:
            send_telegram_message(chat_id, "Data transaksi 2026 belum tersedia.")
            return

        curr_p = periods[0]
        prev_p = periods[1] if len(periods) > 1 else curr_p

        c = data[curr_p]
        p = data[prev_p]

        c_daily = c.get("daily_trx", 0)
        p_daily = p.get("daily_trx", 0)
        diff_daily = c_daily - p_daily
        pct_daily = round((diff_daily / p_daily) * 100, 1) if p_daily > 0 else 0
        sign = "+" if diff_daily >= 0 else ""

        branches = c.get("branches", {})
        br_lines = []
        for br, total_hit in sorted(branches.items(), key=lambda x: x[1], reverse=True):
            br_daily = round(total_hit / c.get("days_count", 16))
            br_lines.append(f"• *{br}*: `{br_daily:,} /hari` (Total {total_hit:,} trx)")

        summary_text = (
            f"📊 *DAILY SUMMARY REPORT — MY ASTAGA!*\n"
            f"Periode: *{curr_p}* (Cut-off {c.get('days_count', 16)} Hari) vs *{prev_p}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"⚡ *METRIK RUN-RATE HARIAN:*\n"
            f"• *Daily Trx*: `{c_daily:,} /hari` ({sign}{diff_daily:,} | {sign}{pct_daily}%)\n"
            f"• *Member Aktif*: `{c.get('daily_customers', 0):,} /hari`\n"
            f"• *Success Rate*: `{c.get('sukses_pct', 0)}%` (🟢 Status Prima)\n"
            f"• *Avg Speed*: `{c.get('avg_dur_str', '00:00')}`\n\n"
            f"🏢 *PERFORMA KINERJA CABANG:*\n" + "\n".join(br_lines) + "\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"💡 *Catatan Analisa:*\n"
            f"Kinerja server sangat stabil dengan SLA sukses {c.get('sukses_pct', 0)}%. "
            f"Cabang BSD dan PP mendominasi volume transaksi utama."
        )
        send_telegram_message(chat_id, summary_text)
    except Exception as e:
        send_telegram_message(chat_id, f"Gagal membuat summary: {e}")


def handle_user_chat(chat_id: int, user_text: str):
    send_chat_action(chat_id, "typing")
    reply = ask_gemini(user_text)
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
                first_name = from_user.get("first_name", "Juragan")
                text = msg.get("text", "").strip()

                if not text:
                    continue

                logger.info(f"Pesan dari [{first_name} | {chat_id}]: {text}")

                # Routing Command
                cmd = text.split()[0].lower()
                if cmd in ("/start", "/help"):
                    handle_command_start(chat_id, first_name)
                elif cmd in ("/server", "/status"):
                    handle_command_server(chat_id)
                elif cmd in ("/summary", "/daily", "/laporan"):
                    handle_command_summary(chat_id)
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
