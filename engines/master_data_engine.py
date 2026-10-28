"""
engines/master_data_engine.py
Pondasi Master Data Center Terpadu (SQLite + Parquet).
Menggantikan kebutuhan input manual di file Excel CUSTOMER_ASTAGA.xlsx & CUSTOMER_OKI.xlsx.

Fitur:
1. Skema database relasional (agents, resellers, branches).
2. Algoritma resolusi hierarki MLM rekursif (Downline -> Upline -> Root Agen Induk -> Cabang).
3. CRUD Operasi untuk Agen (Tambah, Edit SCO/DSO/Tipe/Cabang/Wilayah).
4. Auto-sync ke Parquet cache (.cache/cust_astaga.parquet, dll) agar kalkulasi engine tetap instan (<0.01s).
5. Generator Export Excel (.xlsx) instan kapan pun dibutuhkan.
"""

import os
import sqlite3
import time
from datetime import datetime
import pandas as pd
import openpyxl
import re
import json
from typing import Optional, Any
import engines.metrics_engine as me

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
DB_PATH = os.path.join(MASTER_DIR, "master_data.db")
DMS_RAW_DATA_ROOT = r"C:\DMS RAW DATA"
RAW_DATA_ROOT = r"C:\DMS RAW DATA"

# Definisi Akun Cabang ASTAGA
ASTAGA_BRANCH_MAP = {
    "AR00001": ("BSD", "KEEP"),
    "AR00002": ("PP", "KEEP"),
    "AR00003": ("ICON", "KEEP"),
    "AR00004": ("PRG", "KEEP"),
    "AR00005": ("ICON", "SWITCH KE ICON"),
    "AR00006": ("ONLINE", "KEEP"),
    "AR00007": ("PP", "SWITCH KE PP"),
    "AR00009": ("INTERNAL", "TAKE OUT"),
    "AR20408": ("INTERNAL", "TAKE OUT"),
    "AR02223": ("HQ", "TAKE OUT"),
    "AR00037": ("H2H OKIPAY", "TAKE OUT"),
}

# Definisi Akun Cabang OKIPAY
OKIPAY_BRANCH_MAP = {
    "OP00001": ("OKI PAYMENT", "TAKE OUT"),
    "OP00002": ("ONLINE", "KEEP"),
    "OP00003": ("ONLINE", "KEEP"),
    "OP00004": ("ONLINE", "KEEP"),
    "OP00005": ("H2H", "KEEP"),
    "OP00006": ("ONLINE", "KEEP"),
    "OP00007": ("ONLINE", "KEEP"),
    "OP00008": ("ONLINE", "KEEP"),
    "OP00009": ("ONLINE", "KEEP"),
    "OP00010": ("ONLINE", "KEEP"),
}

EXCLUDE_ASTAGA = {"AR00037", "AR00009", "AR20408", "AR02223"}
WHITELIST_OKIPAY = {"OP00037", "OP00009"}
OKIPAY_DISBANDED_SALES = {"OP07367", "OP07683", "OP07725", "OP13982"}


def normalize_cabang(cab: str) -> str:
    """Normalisasi penamaan cabang ASTAGA: PARUNG PANJANG -> PP, PARUNG BOGOR -> PRG, JASINGA -> PP."""
    if not cab:
        return cab
    c = str(cab).strip().upper()
    if c in ("PARUNG PANJANG", "PP"):
        return "PP"
    if c in ("PARUNG BOGOR", "PRG"):
        return "PRG"
    if c in ("JASINGA", "DEPO JASINGA"):
        return "PP"
    return str(cab).strip()


def parse_num(val, default=0.0) -> float:
    """Parse string/float angka aman dari <null>, nan, atau string berformat."""
    if val is None or pd.isna(val):
        return default
    s = str(val).strip()
    if s in ('<null>', 'nan', 'None', '', 'NULL'):
        return default
    try:
        return float(s.replace(',', ''))
    except (ValueError, TypeError):
        return default


def parse_date(val) -> str:
    """Format string tanggal ISO (2022-07-27T07:28:12.700 -> 2022-07-27 07:28:12)."""
    if val is None or pd.isna(val):
        return None
    s = str(val).strip()
    if s in ('<null>', 'nan', 'None', '', 'NULL'):
        return None
    s = s.replace('T', ' ')
    return s[:19] if len(s) >= 19 else s


def has_active_date(val) -> bool:
    """
    Cek apakah reseller aktif sejak 2023 ke atas (>= 2023).
    Akun dengan aktivitas < 2023 (2017-2022) otomatis di-takeout dari master database.
    """
    if val is None or pd.isna(val):
        return False
    s = str(val).strip()
    if s in ('<null>', 'nan', 'None', '', 'NULL'):
        return False
    yr = s[:4]
    if yr.isdigit():
        return int(yr) >= 2023
    return False


def find_latest_reseller_tsv(brand: str) -> str:
    """
    Mencari file TSV reseller terbaru di C:\\DMS RAW DATA\\MASTER\\ (RS_<BRAND>.tsv)
    atau C:\\DMS RAW DATA\\<BRAND>\\. Fallback ke MASTER/<brand>.tsv jika tidak ada.
    """
    brand = brand.upper()
    candidates = []

    # 1. Cek C:\\DMS RAW DATA\\MASTER\\
    dms_master = os.path.join(DMS_RAW_DATA_ROOT, "MASTER")
    if os.path.isdir(dms_master):
        exact_rs = os.path.join(dms_master, f"RS_{brand}.tsv")
        if os.path.exists(exact_rs):
            candidates.append((os.path.getmtime(exact_rs), exact_rs))
        for entry in os.scandir(dms_master):
            if entry.is_file() and entry.name.lower().endswith(".tsv"):
                if brand.lower() in entry.name.lower() and not entry.name.lower().startswith("kontak"):
                    candidates.append((entry.stat().st_mtime, entry.path))

    # 2. Cek subfolder brand di DMS RAW DATA
    raw_folder = os.path.join(DMS_RAW_DATA_ROOT, brand)
    if os.path.isdir(raw_folder):
        for entry in os.scandir(raw_folder):
            if entry.is_file() and entry.name.lower().endswith(".tsv"):
                candidates.append((entry.stat().st_mtime, entry.path))

    if candidates:
        candidates.sort(reverse=True)
        return candidates[0][1]

    # Fallback ke folder MASTER jika belum ada di RAW DATA
    fallback = os.path.join(MASTER_DIR, f"{brand.lower()}.tsv")
    if os.path.exists(fallback):
        return fallback
    fallback_otomax = os.path.join(MASTER_DIR, f"otomax_reseller_{brand.lower()}.tsv")
    if os.path.exists(fallback_otomax):
        return fallback_otomax
    return None


def get_reseller_radar_status() -> dict:
    """
    Mengembalikan status deteksi TSV Reseller di C:\\RAW DATA dan status sinkronisasi SQLite.
    """
    status = {}
    with get_connection() as conn:
        cursor = conn.cursor()
        for brand in ["ASTAGA", "OKIPAY"]:
            latest_tsv = find_latest_reseller_tsv(brand)
            tsv_info = None
            if latest_tsv and os.path.exists(latest_tsv):
                mtime = os.path.getmtime(latest_tsv)
                fsize = os.path.getsize(latest_tsv)
                tsv_info = {
                    "path": latest_tsv,
                    "filename": os.path.basename(latest_tsv),
                    "mtime": mtime,
                    "date": datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    "size_kb": round(fsize / 1024, 1),
                }

            cursor.execute("SELECT count(*) FROM agents WHERE brand = ?", (brand,))
            total_agents = cursor.fetchone()[0]

            cursor.execute("SELECT count(*) FROM resellers WHERE brand = ?", (brand,))
            total_resellers = cursor.fetchone()[0]

            cursor.execute("SELECT max(updated_at) FROM resellers WHERE brand = ?", (brand,))
            row_up = cursor.fetchone()
            last_updated = row_up[0] if row_up and row_up[0] else None

            is_newer = False
            if tsv_info and last_updated:
                try:
                    db_dt = datetime.strptime(last_updated[:19], "%Y-%m-%d %H:%M:%S")
                    tsv_dt = datetime.fromtimestamp(tsv_info["mtime"])
                    is_newer = (tsv_dt > db_dt)
                except Exception:
                    pass
            elif tsv_info and not last_updated:
                is_newer = True

            status[brand] = {
                "tsv": tsv_info,
                "db_total_agents": total_agents,
                "db_total_resellers": total_resellers,
                "db_last_updated": last_updated,
                "needs_sync": is_newer
            }
    return status


def get_connection():
    """Membuka koneksi ke SQLite database master."""
    os.makedirs(MASTER_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Inisialisasi skema tabel & index master data."""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Tabel Cabang / Depo
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS branches (
                brand TEXT NOT NULL,
                kode_cabang TEXT NOT NULL,
                nama_cabang TEXT NOT NULL,
                action TEXT DEFAULT 'KEEP',
                PRIMARY KEY (brand, kode_cabang)
            )
        """)

        # 2. Tabel Agen (Induk Semang)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS agents (
                brand TEXT NOT NULL,
                agen_id TEXT NOT NULL,
                nama_agen TEXT,
                cabang TEXT NOT NULL,
                type TEXT DEFAULT 'Standard',
                sco TEXT DEFAULT 'NON SCO',
                dso TEXT,
                limit_saldo REAL DEFAULT 0,
                markup REAL DEFAULT 0,
                tgl_daftar TEXT,
                tgl_aktivitas_terakhir TEXT,
                location TEXT,
                kota_kab TEXT,
                kecamatan TEXT,
                kelurahan TEXT,
                jadwal TEXT,
                is_active INTEGER DEFAULT 1,
                updated_at TEXT,
                PRIMARY KEY (brand, agen_id)
            )
        """)

        # 3. Tabel Reseller (Pohon Hierarki MLM)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS resellers (
                brand TEXT NOT NULL,
                kode_reseller TEXT NOT NULL,
                nama_reseller TEXT,
                grup TEXT,
                kode_upline TEXT,
                root_agen_id TEXT,
                cabang TEXT,
                leveling TEXT DEFAULT 'DOWNLINE',
                saldo REAL DEFAULT 0,
                limit_saldo REAL DEFAULT 0,
                markup REAL DEFAULT 0,
                tgl_daftar TEXT,
                tgl_aktivitas_terakhir TEXT,
                updated_at TEXT,
                PRIMARY KEY (brand, kode_reseller)
            )
        """)

        # Pastikan kolom baru tersedia jika tabel sudah ada sebelumnya
        for col, col_type in [("limit_saldo", "REAL DEFAULT 0"), ("markup", "REAL DEFAULT 0"), ("tgl_aktivitas_terakhir", "TEXT")]:
            try:
                cursor.execute(f"ALTER TABLE resellers ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass
            try:
                cursor.execute(f"ALTER TABLE agents ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass

        # Index performa tinggi
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_agents_cabang ON agents(brand, cabang);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_agents_sco ON agents(brand, sco);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_resellers_root ON resellers(brand, root_agen_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_resellers_upline ON resellers(brand, kode_upline);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_resellers_cabang ON resellers(brand, cabang);")

        conn.commit()



def export_dim_csvs_to_dms(brand: str):
    """Mengekspor tabel dimensi ke DMS RAW DATA MASTER"""
    try:
        brand = brand.upper()
        dms_master = r"C:\DMS RAW DATA\MASTER"
        if not os.path.isdir(dms_master):
            return
        with get_connection() as conn:
            # 1. Dim_Agent
            q_agent = '''
                SELECT agen_id, nama_agen, cabang, type, sco, dso,
                       CAST(ROUND(COALESCE(limit_saldo, 0)) AS INTEGER) AS limit_saldo,
                       CAST(ROUND(COALESCE(markup, 0)) AS INTEGER) AS markup,
                       tgl_daftar, tgl_aktivitas_terakhir, jadwal, location, kota_kab, kecamatan, kelurahan
                FROM agents WHERE brand = ? ORDER BY agen_id
            '''
            df_agent = pd.read_sql_query(q_agent, conn, params=(brand,))
            df_agent.to_csv(os.path.join(dms_master, f"Dim_Agent_{brand}.csv"), index=False, encoding='utf-8-sig')

            # 2. Dim_Customer
            q_cust = '''
                SELECT r.kode_reseller, r.nama_reseller, r.grup, r.kode_upline, r.root_agen_id, 
                       r.cabang, r.leveling, a.nama_agen AS nama_root_agen, a.type, a.sco, 
                       CAST(ROUND(COALESCE(r.limit_saldo, 0)) AS INTEGER) AS limit_saldo,
                       CAST(ROUND(COALESCE(r.markup, 0)) AS INTEGER) AS markup
                FROM resellers r
                LEFT JOIN agents a ON r.root_agen_id = a.agen_id AND r.brand = a.brand
                WHERE r.brand = ? ORDER BY r.kode_reseller
            '''
            df_cust = pd.read_sql_query(q_cust, conn, params=(brand,))
            df_cust.to_csv(os.path.join(dms_master, f"Dim_Customer_{brand}.csv"), index=False, encoding='utf-8-sig')

            # 3. Dim_Product
            q_prod = '''
                SELECT kode_produk, nama_produk, kategori, operator, paket
                FROM products WHERE brand = ? ORDER BY kode_produk
            '''
            df_prod = pd.read_sql_query(q_prod, conn, params=(brand,))
            df_prod.to_csv(os.path.join(dms_master, f"Dim_Product_{brand}.csv"), index=False, encoding='utf-8-sig')
            print(f"[DMS-MASTER] Berhasil export Dim CSV {brand} ke {dms_master}")
    except Exception as e:
        print(f"[WARN] Gagal export Dim CSV ke DMS RAW DATA: {e}")

def migrate_astaga(tsv_path: str = None) -> dict:
    """
    Migrasi / Sinkronisasi data ASTAGA:
    1. Baca pohon dari tsv_path atau otomatis deteksi file TSV terbaru di C:\\RAW DATA\\ASTAGA\\.
    2. Build full parent map untuk resolusi hierarki MLM.
    3. Filter aktivitas: hanya reseller dengan Tgl. Aktivitas Terakhir aktif yang disimpan.
    4. Exclude AR00037 & AR00009 (dan internal cabang).
    5. Preservasi metadata agen (SCO, DSO, type, jadwal, dll) murni dari database SQLite existing.
    6. Simpan 4 kolom (Limit Saldo, Markup, Tgl Daftar, Tgl Aktivitas Terakhir).
    """
    print("[MIGRATE] Memulai migrasi data ASTAGA...")
    if not tsv_path:
        tsv_path = find_latest_reseller_tsv("ASTAGA")

    if not tsv_path or not os.path.exists(tsv_path):
        print(f"[WARN] File TSV ASTAGA {tsv_path} tidak ditemukan!")
        return {"ok": False, "error": f"File TSV ASTAGA {tsv_path} tidak ditemukan"}

    try:
        df_tsv = pd.read_csv(tsv_path, sep="\t", encoding="utf-8")
    except UnicodeDecodeError:
        df_tsv = pd.read_csv(tsv_path, sep="\t", encoding="latin-1")
    df_tsv.columns = df_tsv.columns.astype(str).str.strip()

    if 'Kode' not in df_tsv.columns:
        if any(c in df_tsv.columns for c in ['TrxID', 'Produk', 'Tgl. Entri']):
            return {"ok": False, "error": "File yang Anda unggah adalah file TRANSAKSI (TrxID), bukan Master Reseller. Silakan upload file ini ke card 'Pilih / Drag File TSV OtomaX (Otomatis Upsert ke Parquet)' di Tab 1 Ingestion."}
        elif any(c in df_tsv.columns for c in ['Pengirim', 'Tipe']):
            return {"ok": False, "error": "File yang Anda unggah adalah file KONTAK (Pengirim). File Master Reseller harus berisi kolom: Kode, Nama, Grup, Kode Upline, Saldo."}
        else:
            return {"ok": False, "error": f"Kolom 'Kode' tidak ditemukan. Kolom yang terdeteksi: {list(df_tsv.columns)[:5]}"}

    print(f"[MIGRATE] Membaca {len(df_tsv):,} raw baris dari {os.path.basename(tsv_path)}.")

    # Baca metadata existing dari database agents terlebih dahulu agar edit manual / SCO tidak hilang
    existing_meta = {}
    try:
        with get_connection() as conn:
            c = conn.cursor()
            c.execute("""
                SELECT agen_id, nama_agen, cabang, type, sco, dso, location,
                       kota_kab, kecamatan, kelurahan, jadwal
                FROM agents WHERE brand = 'ASTAGA'
            """)
            for r in c.fetchall():
                aid = str(r[0]).strip().upper()
                existing_meta[aid] = {
                    "nama": str(r[1]).strip() if r[1] else "",
                    "cabang": normalize_cabang(r[2]) if r[2] else "",
                    "type": str(r[3]).strip() if r[3] else "Standard",
                    "sco": str(r[4]).strip() if r[4] else "NON SCO",
                    "dso": str(r[5]).strip() if r[5] else "",
                    "location": str(r[6]).strip() if r[6] else "",
                    "kota_kab": str(r[7]).strip() if r[7] else "",
                    "kecamatan": str(r[8]).strip() if r[8] else "",
                    "kelurahan": str(r[9]).strip() if r[9] else "",
                    "jadwal": str(r[10]).strip() if r[10] else "",
                }
    except Exception as e:
        print(f"[WARN] Gagal membaca existing agents dari DB: {e}")

    # Catatan: Metadata agen existing murni dibaca dari database SQLite (agents)
    # File Excel di MASTER/ sudah dieliminasi total untuk standarisasi deployment online.

    # 1. Build FULL parent map & info map dari SEMUA baris TSV
    parent_map = {}
    info_map = {}
    for _, r in df_tsv.iterrows():
        k = str(r['Kode']).strip().upper()
        up_val = r.get('Kode Upline')
        up = str(up_val).strip().upper() if pd.notna(up_val) and str(up_val).strip().upper() not in ('<NULL>', 'NAN', '', 'NONE') else None
        parent_map[k] = up
        info_map[k] = {
            "nama": str(r.get('Nama', '')).strip() if pd.notna(r.get('Nama')) else "",
            "grup": str(r.get('Grup', '')).strip() if pd.notna(r.get('Grup')) else "",
            "saldo": parse_num(r.get('Saldo')),
            "limit_saldo": parse_num(r.get('Limit Saldo')),
            "markup": parse_num(r.get('Markup')),
            "tgl_daftar": parse_date(r.get('Tgl. Daftar')),
            "tgl_aktif": parse_date(r.get('Tgl. Aktivitas Terakhir')),
        }

    # 2. Filter hanya yang memiliki tanggal aktivitas terakhir (Takeout jika kosong)
    active_keys = [k for k, inf in info_map.items() if has_active_date(inf['tgl_aktif']) and k not in EXCLUDE_ASTAGA]
    print(f"[MIGRATE] ASTAGA: {len(active_keys):,} reseller aktif (dari total {len(info_map):,} akun).")

    # 3. Resolusi Hierarki MLM
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    reseller_records = []
    root_agen_map = {}
    max_act_map = {}

    for k in active_keys:
        up = parent_map.get(k)
        visited = set()
        curr = k
        root_agen = None
        cabang = None
        leveling = "DOWNLINE"

        while True:
            if curr in visited:
                break
            visited.add(curr)
            curr_up = parent_map.get(curr)
            if not curr_up:
                root_agen = curr
                cabang = "UNMAPPED"
                leveling = "NO_UPLINE"
                break
            if curr_up in ASTAGA_BRANCH_MAP:
                cabang, _ = ASTAGA_BRANCH_MAP[curr_up]
                root_agen = curr
                leveling = "AGEN" if curr == k else "DOWNLINE"
                break
            curr = curr_up

        if cabang in ("INTERNAL", "HQ", "H2H OKIPAY", "TAKE OUT"):
            continue

        cabang = normalize_cabang(cabang)

        info = info_map.get(k, {})
        t_act = info.get("tgl_aktif")
        if root_agen and t_act:
            if root_agen not in max_act_map or t_act > max_act_map[root_agen]:
                max_act_map[root_agen] = t_act

        if root_agen and cabang not in ("UNMAPPED", "HQ", "INTERNAL", "H2H OKIPAY", "TAKE OUT"):
            root_agen_map[root_agen] = cabang

        reseller_records.append((
            "ASTAGA", k, info.get("nama"), info.get("grup"), up,
            root_agen, cabang, leveling, info.get("saldo", 0.0),
            info.get("limit_saldo", 0.0), info.get("markup", 0.0),
            info.get("tgl_daftar"), info.get("tgl_aktif"), now_str
        ))

    # Bentuk Agent Records (dengan aktivitas terbaru dari akun induk atau jaringan tokonya)
    agent_records = {}
    for root_agen, cabang in root_agen_map.items():
        em = existing_meta.get(root_agen, {})
        root_info = info_map.get(root_agen, {})
        nama_agen = em.get("nama") or root_info.get("nama") or root_agen
        cabang_final = normalize_cabang(em.get("cabang")) or cabang

        lim_val = root_info.get("limit_saldo", 0.0)
        final_type = me.classify_astaga_agent_type(
            limit_saldo=lim_val,
            cabang=cabang_final,
            grup=root_info.get("grup", ""),
            existing_type=em.get("type", "")
        )
        final_sco = me.normalize_astaga_sco(cabang_final, em.get("sco", "NON SCO"))

        root_act = root_info.get("tgl_aktif")
        dl_act = max_act_map.get(root_agen)
        final_act = max(filter(None, [root_act, dl_act]), default=None)

        agent_records[root_agen] = (
            "ASTAGA", root_agen, nama_agen, cabang_final,
            final_type, final_sco,
            em.get("dso", ""), lim_val,
            root_info.get("markup", 0.0), root_info.get("tgl_daftar"),
            final_act, em.get("location", ""),
            em.get("kota_kab", ""), em.get("kecamatan", ""),
            em.get("kelurahan", ""), em.get("jadwal", ""), 1, now_str
        )

    # Simpan ke SQLite
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Simpan cabang
        for k_cab, (nm_cab, act) in ASTAGA_BRANCH_MAP.items():
            cursor.execute("""
                INSERT OR REPLACE INTO branches (brand, kode_cabang, nama_cabang, action)
                VALUES ('ASTAGA', ?, ?, ?)
            """, (k_cab, nm_cab, act))

        # Reset ASTAGA data agar data non-aktif lama terbersihkan
        cursor.execute("DELETE FROM resellers WHERE brand = 'ASTAGA'")
        cursor.execute("DELETE FROM agents WHERE brand = 'ASTAGA'")

        cursor.executemany("""
            INSERT OR REPLACE INTO agents (
                brand, agen_id, nama_agen, cabang, type, sco, dso,
                limit_saldo, markup, tgl_daftar, tgl_aktivitas_terakhir,
                location, kota_kab, kecamatan, kelurahan, jadwal, is_active, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, list(agent_records.values()))

        cursor.executemany("""
            INSERT OR REPLACE INTO resellers (
                brand, kode_reseller, nama_reseller, grup, kode_upline,
                root_agen_id, cabang, leveling, saldo, limit_saldo, markup,
                tgl_daftar, tgl_aktivitas_terakhir, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, reseller_records)

        conn.commit()

    # Refresh Parquet cache & memory cache
    sync_to_parquet("ASTAGA")
    export_dim_csvs_to_dms("ASTAGA")
    try:
        import engines.customer_engine as ce
        ce.clear_cache()
    except Exception:
        pass

    print(f"[MIGRATE] ASTAGA Selesai: {len(agent_records):,} Agen & {len(reseller_records):,} Reseller tersimpan di SQLite & Parquet!")
    return {
        "ok": True,
        "brand": "ASTAGA",
        "tsv_file": os.path.basename(tsv_path),
        "total_agents": len(agent_records),
        "total_resellers": len(reseller_records)
    }


def migrate_okipay(tsv_path: str = None) -> dict:
    """
    Migrasi / Sinkronisasi data OKIPAY:
    1. Baca pohon dari tsv_path atau otomatis deteksi file TSV terbaru di C:\\RAW DATA\\OKIPAY\\.
    2. Build full parent map untuk resolusi hierarki MLM.
    3. Filter aktivitas: hanya reseller dengan Tgl. Aktivitas Terakhir aktif (takeout jika kosong).
       KECUALI: OP00037 & OP00009 TIDAK di-take out (whitelist tetap disimpan).
    4. Pelepasan akun sales lama (OP07367, OP07683, OP07725, OP13982) menjadi Agen Mandiri Cabang ONLINE.
    5. Preservasi metadata agen existing dari SQLite (agar editan admin tidak ter-overwrite).
    6. Simpan 4 kolom (Limit Saldo, Markup, Tgl Daftar, Tgl Aktivitas Terakhir) + Saldo.
    7. Auto-refresh Parquet cache & memory cache.
    """
    print("[MIGRATE] Memulai migrasi data OKIPAY...")
    if not tsv_path:
        tsv_path = find_latest_reseller_tsv("OKIPAY")

    if not tsv_path or not os.path.exists(tsv_path):
        print(f"[WARN] File TSV OKIPAY {tsv_path} tidak ditemukan!")
        return {"ok": False, "error": f"File TSV OKIPAY {tsv_path} tidak ditemukan"}

    try:
        df_tsv = pd.read_csv(tsv_path, sep="\t", encoding="utf-8")
    except UnicodeDecodeError:
        df_tsv = pd.read_csv(tsv_path, sep="\t", encoding="latin-1")
    df_tsv.columns = df_tsv.columns.astype(str).str.strip()

    if 'Kode' not in df_tsv.columns:
        if any(c in df_tsv.columns for c in ['TrxID', 'Produk', 'Tgl. Entri']):
            return {"ok": False, "error": "File yang Anda unggah adalah file TRANSAKSI (TrxID), bukan Master Reseller. Silakan upload file ini ke card 'Pilih / Drag File TSV OtomaX (Otomatis Upsert ke Parquet)' di Tab 1 Ingestion."}
        elif any(c in df_tsv.columns for c in ['Pengirim', 'Tipe']):
            return {"ok": False, "error": "File yang Anda unggah adalah file KONTAK (Pengirim). File Master Reseller harus berisi kolom: Kode, Nama, Grup, Kode Upline, Saldo."}
        else:
            return {"ok": False, "error": f"Kolom 'Kode' tidak ditemukan. Kolom yang terdeteksi: {list(df_tsv.columns)[:5]}"}

    print(f"[MIGRATE] Membaca {len(df_tsv):,} raw baris dari {os.path.basename(tsv_path)}.")

    # Baca metadata existing dari database agents terlebih dahulu agar edit manual tidak hilang
    existing_meta = {}
    try:
        with get_connection() as conn:
            c = conn.cursor()
            c.execute("""
                SELECT agen_id, nama_agen, cabang, type, sco, dso, location,
                       kota_kab, kecamatan, kelurahan, jadwal
                FROM agents WHERE brand = 'OKIPAY'
            """)
            for r in c.fetchall():
                aid = str(r[0]).strip().upper()
                existing_meta[aid] = {
                    "nama": str(r[1]).strip() if r[1] else "",
                    "cabang": str(r[2]).strip() if r[2] else "",
                    "type": str(r[3]).strip() if r[3] else "Prima",
                    "sco": str(r[4]).strip() if r[4] else "ONLINE",
                    "dso": str(r[5]).strip() if r[5] else "-",
                    "location": str(r[6]).strip() if r[6] else "-",
                    "kota_kab": str(r[7]).strip() if r[7] else "-",
                    "kecamatan": str(r[8]).strip() if r[8] else "-",
                    "kelurahan": str(r[9]).strip() if r[9] else "-",
                    "jadwal": str(r[10]).strip() if r[10] else "-",
                }
    except Exception as e:
        print(f"[WARN] Gagal membaca existing agents OKIPAY dari DB: {e}")

    # 1. Build FULL parent map & info map dari SEMUA baris TSV
    parent_map = {}
    info_map = {}
    for _, r in df_tsv.iterrows():
        k = str(r['Kode']).strip().upper()
        up_val = r.get('Kode Upline')
        up = str(up_val).strip().upper() if pd.notna(up_val) and str(up_val).strip().upper() not in ('<NULL>', 'NAN', '', 'NONE') else None
        parent_map[k] = up
        info_map[k] = {
            "nama": str(r.get('Nama', '')).strip() if pd.notna(r.get('Nama')) else "",
            "grup": str(r.get('Grup', '')).strip() if pd.notna(r.get('Grup')) else "",
            "saldo": parse_num(r.get('Saldo')),
            "limit_saldo": parse_num(r.get('Limit Saldo')),
            "markup": parse_num(r.get('Markup')),
            "tgl_daftar": parse_date(r.get('Tgl. Daftar')),
            "tgl_aktif": parse_date(r.get('Tgl. Aktivitas Terakhir')),
        }

    # 2. Filter aktivitas: hanya dengan tgl_aktif aktif ATAU whitelist khusus (OP00037, OP00009)
    # OP00001 adalah akun root sistem ('OKI Payment') -> takeout
    active_keys = [k for k, inf in info_map.items() if (has_active_date(inf['tgl_aktif']) or k in WHITELIST_OKIPAY) and k != "OP00001"]
    print(f"[MIGRATE] OKIPAY: {len(active_keys):,} reseller aktif (dari total {len(info_map):,} akun).")

    # 3. Resolusi Hierarki MLM
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    reseller_records = []
    root_agen_map = {}
    max_act_map = {}

    for k in active_keys:
        up = parent_map.get(k)
        visited = set()
        curr = k
        root_agen = None
        cabang = None
        leveling = "DOWNLINE"

        while True:
            if curr in visited:
                break
            visited.add(curr)
            curr_up = parent_map.get(curr)
            if not curr_up:
                root_agen = curr
                cabang = OKIPAY_BRANCH_MAP.get(curr, ("ONLINE", "KEEP"))[0]
                leveling = "NO_UPLINE"
                break
            if curr_up in OKIPAY_DISBANDED_SALES:
                sales_up = parent_map.get(curr_up)
                cabang, _ = OKIPAY_BRANCH_MAP.get(sales_up, ("ONLINE", "KEEP"))
                root_agen = curr
                leveling = "AGEN" if curr == k else "DOWNLINE"
                break
            if curr_up in OKIPAY_BRANCH_MAP:
                cabang, _ = OKIPAY_BRANCH_MAP[curr_up]
                root_agen = curr
                leveling = "AGEN" if curr == k else "DOWNLINE"
                break
            curr = curr_up

        if cabang in ("OKI PAYMENT", "TAKE OUT"):
            continue

        if k in OKIPAY_DISBANDED_SALES:
            leveling = "SALES"

        info = info_map.get(k, {})
        t_act = info.get("tgl_aktif")
        if root_agen and t_act:
            if root_agen not in max_act_map or t_act > max_act_map[root_agen]:
                max_act_map[root_agen] = t_act

        if root_agen and cabang not in ("UNMAPPED", "TAKE OUT") and root_agen not in OKIPAY_DISBANDED_SALES:
            root_agen_map[root_agen] = cabang

        reseller_records.append((
            "OKIPAY", k, info.get("nama"), info.get("grup"), up,
            root_agen, cabang, leveling, info.get("saldo", 0.0),
            info.get("limit_saldo", 0.0), info.get("markup", 0.0),
            info.get("tgl_daftar"), info.get("tgl_aktif"), now_str
        ))

    # Bentuk Agent Records OKIPAY (Cabang ONLINE -> SCO 'ONLINE', Tipe 'Prima')
    agent_records = {}
    for root_agen, cabang in root_agen_map.items():
        em = existing_meta.get(root_agen, {})
        root_info = info_map.get(root_agen, {})
        nama_agen = em.get("nama") or root_info.get("nama") or root_agen
        cabang_final = em.get("cabang") or cabang
        sco_final = "ONLINE" if cabang_final == "ONLINE" else "NON SCO"
        type_final = em.get("type") or "Prima"

        root_act = root_info.get("tgl_aktif")
        dl_act = max_act_map.get(root_agen)
        final_act = max(filter(None, [root_act, dl_act]), default=None)

        agent_records[root_agen] = (
            "OKIPAY", root_agen, nama_agen, cabang_final,
            type_final, sco_final, em.get("dso", "-"), root_info.get("limit_saldo", 0.0),
            root_info.get("markup", 0.0), root_info.get("tgl_daftar"),
            final_act, em.get("location", "-"), em.get("kota_kab", "-"),
            em.get("kecamatan", "-"), em.get("kelurahan", "-"), em.get("jadwal", "-"), 1, now_str
        )

    # Simpan ke SQLite
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Simpan cabang OKIPAY
        for k_cab, (nm_cab, act) in OKIPAY_BRANCH_MAP.items():
            cursor.execute("""
                INSERT OR REPLACE INTO branches (brand, kode_cabang, nama_cabang, action)
                VALUES ('OKIPAY', ?, ?, ?)
            """, (k_cab, nm_cab, act))

        # Reset OKIPAY data
        cursor.execute("DELETE FROM resellers WHERE brand = 'OKIPAY'")
        cursor.execute("DELETE FROM agents WHERE brand = 'OKIPAY'")

        cursor.executemany("""
            INSERT OR REPLACE INTO agents (
                brand, agen_id, nama_agen, cabang, type, sco, dso,
                limit_saldo, markup, tgl_daftar, tgl_aktivitas_terakhir,
                location, kota_kab, kecamatan, kelurahan, jadwal, is_active, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, list(agent_records.values()))

        cursor.executemany("""
            INSERT OR REPLACE INTO resellers (
                brand, kode_reseller, nama_reseller, grup, kode_upline,
                root_agen_id, cabang, leveling, saldo, limit_saldo, markup,
                tgl_daftar, tgl_aktivitas_terakhir, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, reseller_records)

        conn.commit()

    # Refresh Parquet cache & memory cache
    sync_to_parquet("OKIPAY")
    export_dim_csvs_to_dms("OKIPAY")
    try:
        import engines.customer_engine as ce
        ce.clear_cache()
    except Exception:
        pass

    print(f"[MIGRATE] OKIPAY Selesai: {len(agent_records):,} Agen & {len(reseller_records):,} Reseller tersimpan di SQLite & Parquet!")
    return {
        "ok": True,
        "brand": "OKIPAY",
        "tsv_file": os.path.basename(tsv_path),
        "total_agents": len(agent_records),
        "total_resellers": len(reseller_records)
    }


def clean_phone_number(raw_val) -> Optional[str]:
    """Standarisasi format nomor HP Indonesia ke format murni 628xxxxxxxxxx."""
    if not raw_val:
        return None
    s = str(raw_val).strip()
    s = re.sub(r"@\.?c\.us$", "", s, flags=re.IGNORECASE)
    s = s.replace("+", "").replace("-", "").replace(" ", "").replace(".", "")
    s = re.sub(r"[^0-9]", "", s)
    if not s:
        return None
    if s.startswith("08"):
        s = "628" + s[2:]
    elif s.startswith("8"):
        s = "628" + s[1:]
    return s if s.startswith("628") and len(s) >= 10 else None


def migrate_pengirim(tsv_path: str, brand: str = "ASTAGA") -> dict:
    """
    Mengimpor dan memperbarui database nomor pengirim (SMS, WA, Jabber) dari file export OtomaX.
    1. Membaca file TSV/CSV mentah (misal KONTAK_ASTAGA.tsv atau KONTAK_OKIPAY.tsv).
    2. Deteksi otomatis kolom Pengirim, Kode Reseller, Nama Reseller, Tipe.
    3. Filter akun aktif pada tabel 'resellers' untuk brand yang dipilih.
    4. Menyimpan daftar nomor unik pada kolom 'candidate_phones' (JSON).
    5. Menentukan no_wa dan no_sms utama secara cerdas.
    6. Update tabel reseller_contacts di SQLite master_data.db.
    7. Backup file ke C:\\DMS RAW DATA\\MASTER jika direktori tersedia.
    """
    import time
    from collections import defaultdict
    import csv
    import shutil
    from datetime import datetime

    t0 = time.time()
    brand = (brand or "ASTAGA").strip().upper()

    if not tsv_path or not os.path.exists(tsv_path):
        return {"ok": False, "error": f"File TSV Pengirim tidak ditemukan: {tsv_path}"}

    rows = []
    delimiter = "\t"

    for enc in ["utf-8", "latin-1", "cp1252"]:
        try:
            with open(tsv_path, "r", encoding=enc, errors="ignore") as f:
                first_line = f.readline()
                if "\t" in first_line:
                    delimiter = "\t"
                elif "," in first_line:
                    delimiter = ","
                elif ";" in first_line:
                    delimiter = ";"
                f.seek(0)
                reader = csv.reader(f, delimiter=delimiter)
                for r in reader:
                    if r and any(field.strip() for field in r):
                        rows.append([field.strip() for field in r])
            break
        except Exception:
            continue

    if not rows or len(rows) < 2:
        return {"ok": False, "error": "File kosong atau tidak memiliki baris data yang valid."}

    header = [c.lower() for c in rows[0]]
    raw_header = rows[0]

    idx_pengirim = -1
    idx_kode = -1
    idx_nama = -1
    idx_tipe = -1

    for i, col in enumerate(header):
        if "pengirim" in col or "telepon" in col or "phone" in col or "msisdn" in col:
            idx_pengirim = i
        elif "nama" in col:
            idx_nama = i
        elif "kode" in col:
            idx_kode = i
        elif "reseller" in col and idx_kode == -1:
            idx_kode = i
        elif "tipe" in col or "type" in col:
            idx_tipe = i

    if idx_pengirim == -1 or idx_kode == -1:
        return {
            "ok": False,
            "error": f"Kolom 'Pengirim' atau 'Kode Reseller' tidak ditemukan. Kolom terdeteksi: {raw_header[:6]}"
        }

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT kode_reseller, nama_reseller FROM resellers WHERE brand = ?", (brand,))
        active_resellers = {r[0].strip().upper(): r[1] for r in cur.fetchall()}

    if not active_resellers:
        return {"ok": False, "error": f"Tidak ditemukan master reseller aktif untuk brand {brand}. Harap unggah master reseller terlebih dahulu."}

    contacts_map = defaultdict(lambda: {
        "name": "",
        "wa_candidates": [],
        "sms_candidates": [],
        "all_unique": []
    })

    valid_contacts_count = 0

    for r in rows[1:]:
        if len(r) <= max(idx_pengirim, idx_kode):
            continue
        raw_code = r[idx_kode].strip().upper()
        raw_phone = r[idx_pengirim].strip()
        tipe = r[idx_tipe].strip().upper() if (idx_tipe != -1 and len(r) > idx_tipe) else ""
        rs_name = r[idx_nama].strip() if (idx_nama != -1 and len(r) > idx_nama) else ""

        if raw_code not in active_resellers:
            continue

        p = clean_phone_number(raw_phone)
        if not p:
            continue

        valid_contacts_count += 1
        entry = contacts_map[raw_code]
        if not entry["name"] and rs_name:
            entry["name"] = rs_name

        if p not in entry["all_unique"]:
            entry["all_unique"].append(p)

        if tipe in ("G", "W", "J", "IP") and p not in entry["wa_candidates"]:
            entry["wa_candidates"].append(p)
        elif tipe == "S" and p not in entry["sms_candidates"]:
            entry["sms_candidates"].append(p)

    now_str = datetime.now().isoformat()
    rows_to_insert = []

    for rs_code, info in contacts_map.items():
        name = info["name"] or active_resellers.get(rs_code, rs_code)
        all_unique = info["all_unique"]
        wa_cands = info["wa_candidates"]
        sms_cands = info["sms_candidates"]

        intersection = [p for p in wa_cands if p in sms_cands]
        if intersection:
            primary_wa = intersection[0]
        elif wa_cands:
            primary_wa = wa_cands[0]
        elif all_unique:
            primary_wa = all_unique[0]
        else:
            primary_wa = None

        primary_sms = sms_cands[0] if sms_cands else (all_unique[0] if all_unique else None)
        channel = "WHATSAPP" if wa_cands else "SMS"
        candidates_json = json.dumps(all_unique)

        rows_to_insert.append((
            rs_code,
            name,
            primary_wa,
            primary_sms,
            channel,
            "TSV_UPLOAD",
            candidates_json,
            now_str
        ))

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            DELETE FROM reseller_contacts 
            WHERE kode_reseller IN (SELECT kode_reseller FROM resellers WHERE brand = ?)
        """, (brand,))

        cur.executemany("""
            INSERT OR REPLACE INTO reseller_contacts (
                kode_reseller, nama_reseller, no_wa, no_sms,
                primary_channel, source, candidate_phones, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, rows_to_insert)
        conn.commit()

    dms_master = r"C:\DMS RAW DATA\MASTER"
    if os.path.exists(dms_master):
        try:
            target_bak = os.path.join(dms_master, f"KONTAK_{brand}.tsv")
            shutil.copy2(tsv_path, target_bak)
        except Exception:
            pass

    elapsed = round(time.time() - t0, 2)
    print(f"[PENGIRIM] Selesai sinkronisasi kontak {brand}: {len(rows_to_insert):,} reseller aktif, {valid_contacts_count:,} kontak valid dalam {elapsed}s.")

    return {
        "ok": True,
        "brand": brand,
        "total_rows_raw": len(rows) - 1,
        "total_contacts_valid": valid_contacts_count,
        "total_resellers_updated": len(rows_to_insert),
        "total_phones_registered": sum(len(c["all_unique"]) for c in contacts_map.values()),
        "elapsed_sec": elapsed
    }


def sync_resellers_from_tsv(brand: str = "ALL") -> dict:
    """
    Fungsi sinkronisasi mingguan resmi:
    Membaca file TSV reseller terbaru di C:\\RAW DATA\\ASTAGA & C:\\RAW DATA\\OKIPAY,
    memetakan hierarki, memperbarui SQLite, dan me-refresh cache Parquet & RAM.
    """
    brand = brand.upper()
    t0 = time.time()
    results = {}

    if brand in ("ASTAGA", "ALL"):
        tsv_a = find_latest_reseller_tsv("ASTAGA")
        if tsv_a:
            res_a = migrate_astaga(tsv_path=tsv_a)
            results["ASTAGA"] = res_a
        else:
            results["ASTAGA"] = {"ok": False, "error": "File TSV ASTAGA tidak ditemukan"}

    if brand in ("OKIPAY", "ALL"):
        tsv_o = find_latest_reseller_tsv("OKIPAY")
        if tsv_o:
            res_o = migrate_okipay(tsv_path=tsv_o)
            results["OKIPAY"] = res_o
        else:
            results["OKIPAY"] = {"ok": False, "error": "File TSV OKIPAY tidak ditemukan"}

    sync_to_parquet(brand)

    try:
        import engines.customer_engine as ce
        ce.clear_cache()
    except Exception:
        pass

    try:
        import engines.overview_engine as oe
        oe.clear_unmapped_cache()
    except Exception:
        pass

    return {
        "ok": True,
        "elapsed_sec": round(time.time() - t0, 2),
        "results": results
    }


def sync_to_parquet(brand: str = "ALL"):
    """
    Ekspor master data dari SQLite ke Parquet cache & JSON cache
    sehingga customer_engine, pivot_engine, dan reseller_engine membaca secara instan.
    """
    import json
    brands = ["ASTAGA", "OKIPAY"] if brand == "ALL" else [brand.upper()]
    os.makedirs(CACHE_DIR, exist_ok=True)

    with get_connection() as conn:
        for b in brands:
            # 1. cust_{b.lower()}.parquet (Mapping cepat ar_id -> cabang)
            query_map = """
                SELECT kode_reseller AS ar_id, cabang
                FROM resellers
                WHERE brand = ? AND cabang IS NOT NULL AND cabang != ''
            """
            df_map = pd.read_sql_query(query_map, conn, params=(b,))
            
            q_agents = """
                SELECT agen_id AS ar_id, cabang
                FROM agents
                WHERE brand = ? AND cabang IS NOT NULL AND cabang != ''
            """
            df_a = pd.read_sql_query(q_agents, conn, params=(b,))
            df_combined = pd.concat([df_map, df_a]).drop_duplicates(subset=["ar_id"])

            out_parquet = os.path.join(CACHE_DIR, f"cust_{b.lower()}.parquet")
            df_combined.to_parquet(out_parquet, index=False)

            # 2. cust_full_{b.lower()}.parquet (Kolom lengkap untuk Pivot, Analisa & Churn)
            query_full = """
                SELECT 
                    r.kode_reseller AS ar_id,
                    r.nama_reseller AS reseller_name,
                    r.grup AS [group],
                    r.root_agen_id AS agen_id,
                    COALESCE(a.nama_agen, r.root_agen_id) AS agen_name,
                    COALESCE(a.type, 'Standard') AS tipe,
                    COALESCE(a.sco, 'NON SCO') AS sco,
                    COALESCE(r.cabang, a.cabang) AS cabang,
                    r.saldo AS saldo,
                    r.limit_saldo AS limit_saldo,
                    r.markup AS markup,
                    r.tgl_daftar AS tgl_daftar,
                    r.tgl_aktivitas_terakhir AS tgl_aktivitas_terakhir
                FROM resellers r
                LEFT JOIN agents a ON a.brand = r.brand AND a.agen_id = r.root_agen_id
                WHERE r.brand = ?
            """
            df_full = pd.read_sql_query(query_full, conn, params=(b,))
            out_full_parquet = os.path.join(CACHE_DIR, f"cust_full_{b.lower()}.parquet")
            df_full.to_parquet(out_full_parquet, index=False)
            print(f"[SYNC] Parquet {b} berhasil diperbarui: {len(df_combined):,} mapping & {len(df_full):,} full rows tersimpan.")


    # Invalidate in-memory caches
    try:
        import engines.customer_engine as ce
        ce.clear_cache()
    except Exception:
        pass

    try:
        import engines.pivot_engine as pe
        pe._CUST_CACHE.clear()
    except Exception:
        pass

    try:
        import engines.reseller_engine as re
        re._RESELLER_META_CACHE = None
        re._AGEN_META_CACHE = None
    except Exception:
        pass


def get_filter_options(brand: str = "ASTAGA") -> dict:
    """Mengambil list cabang, sco, tipe dan ringkasan metrik statistik."""
    brand = brand.upper()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT cabang FROM agents 
            WHERE brand = ? AND cabang IS NOT NULL AND cabang != ''
            ORDER BY cabang
        """, (brand,))
        cabangs = [r[0] for r in cursor.fetchall()]

        cursor.execute("""
            SELECT DISTINCT sco FROM agents 
            WHERE brand = ? AND sco IS NOT NULL AND sco != ''
            ORDER BY sco
        """, (brand,))
        scos = [r[0] for r in cursor.fetchall()]

        cursor.execute("""
            SELECT DISTINCT dso FROM agents 
            WHERE brand = ? AND dso IS NOT NULL AND dso != '' AND dso != '-'
            ORDER BY dso
        """, (brand,))
        dsos = [r[0] for r in cursor.fetchall()]

        cursor.execute("""
            SELECT DISTINCT type FROM agents 
            WHERE brand = ? AND type IS NOT NULL AND type != ''
            ORDER BY type
        """, (brand,))
        types = [r[0] for r in cursor.fetchall()]

        cursor.execute("SELECT COUNT(*) FROM agents WHERE brand = ?", (brand,))
        total_agents = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM resellers WHERE brand = ?", (brand,))
        total_resellers = cursor.fetchone()[0]

        # 1. SCO Sales Aktif (bukan NON SCO, bukan ONLINE, bukan kosong/unmapped)
        cursor.execute("""
            SELECT COUNT(*) FROM agents 
            WHERE brand = ? 
              AND sco IS NOT NULL 
              AND sco != '' 
              AND sco != '-' 
              AND sco != 'NON SCO' 
              AND sco != 'ONLINE'
              AND sco != 'BELUM DIPETAKAN'
              AND sco != 'UNMAPPED'
        """, (brand,))
        sales_sco = cursor.fetchone()[0]

        # 2. NON SCO (Omset Cabang Fisik / Non-Sales)
        cursor.execute("""
            SELECT COUNT(*) FROM agents 
            WHERE brand = ? AND sco = 'NON SCO'
        """, (brand,))
        non_sco = cursor.fetchone()[0]

        # 3. ONLINE (Pendaftaran Mandiri)
        cursor.execute("""
            SELECT COUNT(*) FROM agents 
            WHERE brand = ? AND (sco = 'ONLINE' OR cabang = 'ONLINE')
        """, (brand,))
        online_sco = cursor.fetchone()[0]

        # 4. Truly Unmapped (Belum dipetakan sama sekali)
        cursor.execute("""
            SELECT COUNT(*) FROM agents 
            WHERE brand = ? 
              AND (
                sco IS NULL OR sco = '' OR sco = '-' OR sco = 'BELUM DIPETAKAN' OR sco = 'UNMAPPED'
                OR cabang IS NULL OR cabang = '' OR cabang = '-' OR cabang = 'UNMAPPED'
              )
        """, (brand,))
        unmapped_sco = cursor.fetchone()[0]

        return {
            "cabangs": cabangs,
            "scos": scos,
            "dsos": dsos,
            "types": types,
            "stats": {
                "total_agents": total_agents,
                "total_resellers": total_resellers,
                "sales_sco": sales_sco,
                "non_sco": non_sco,
                "online_sco": online_sco,
                "unmapped_sco": unmapped_sco,
                "mapped_sco": sales_sco
            }
        }


def query_agents(brand: str = "ASTAGA", cabang: str = None, sco: str = None, type_val: str = None, search: str = None, leveling: str = "ALL", page: int = 1, page_size: int = 20) -> dict:
    """
    Query daftar Master Reseller / Agen dengan filter hierarki MLM, cabang, SCO, tipe, pencarian, dan pagination.
    Mendukung seluruh akun reseller (Agen Induk dan Downline).
    """
    brand = brand.upper()
    page = max(1, page)
    page_size = max(10, min(100, page_size))
    offset = (page - 1) * page_size

    where_clauses = ["r.brand = ?"]
    params = [brand]

    # Filter Leveling: ALL / AGEN / DOWNLINE
    if leveling and leveling.upper() != "ALL":
        lev = leveling.upper()
        if lev in ("AGEN", "ROOT"):
            where_clauses.append("(r.leveling = 'AGEN' OR r.leveling = 'ROOT' OR r.kode_reseller = r.root_agen_id)")
        elif lev == "DOWNLINE":
            where_clauses.append("(r.leveling = 'DOWNLINE' AND r.kode_reseller != r.root_agen_id)")

    if cabang and cabang != "ALL":
        where_clauses.append("COALESCE(r.cabang, a.cabang) = ?")
        params.append(cabang)

    if sco and sco != "ALL":
        if sco == "UNMAPPED":
            where_clauses.append("""(
                COALESCE(a.sco, 'NON SCO') IS NULL 
                OR a.sco = '' 
                OR a.sco = '-' 
                OR a.sco = 'BELUM DIPETAKAN' 
                OR a.sco = 'UNMAPPED'
                OR r.cabang IS NULL 
                OR r.cabang = '' 
                OR r.cabang = '-' 
                OR r.cabang = 'UNMAPPED'
            )""")
        elif sco in ("NON_SCO", "NON SCO"):
            where_clauses.append("COALESCE(a.sco, 'NON SCO') = 'NON SCO'")
        elif sco == "ONLINE":
            where_clauses.append("(COALESCE(a.sco, 'NON SCO') = 'ONLINE' OR COALESCE(r.cabang, a.cabang) = 'ONLINE')")
        elif sco == "SALES_ONLY":
            where_clauses.append("""(
                a.sco IS NOT NULL 
                AND a.sco != '' 
                AND a.sco != '-' 
                AND a.sco != 'NON SCO' 
                AND a.sco != 'ONLINE'
                AND a.sco != 'BELUM DIPETAKAN'
                AND a.sco != 'UNMAPPED'
            )""")
        else:
            where_clauses.append("COALESCE(a.sco, 'NON SCO') = ?")
            params.append(sco)

    if type_val and type_val != "ALL":
        where_clauses.append("COALESCE(a.type, 'Prima') = ?")
        params.append(type_val)

    if search and search.strip():
        s = f"%{search.strip()}%"
        where_clauses.append("(r.kode_reseller LIKE ? OR r.nama_reseller LIKE ? OR r.kode_upline LIKE ? OR r.root_agen_id LIKE ?)")
        params.extend([s, s, s, s])

    where_sql = " AND ".join(where_clauses)

    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Total matching
        count_sql = f"""
            SELECT COUNT(*) 
            FROM resellers r
            LEFT JOIN agents a ON r.brand = a.brand AND r.root_agen_id = a.agen_id
            WHERE {where_sql}
        """
        cursor.execute(count_sql, tuple(params))
        total_count = cursor.fetchone()[0]

        # Query data rows
        sql = f"""
            SELECT 
                r.kode_reseller,
                r.nama_reseller,
                r.grup,
                r.kode_upline,
                r.leveling,
                r.root_agen_id,
                COALESCE(a.nama_agen, r.nama_reseller) AS nama_root_agen,
                COALESCE(r.cabang, a.cabang, 'UNMAPPED') AS cabang,
                COALESCE(a.type, 'Prima') AS type,
                COALESCE(a.sco, 'NON SCO') AS sco,
                COALESCE(a.dso, '-') AS dso,
                COALESCE(a.jadwal, '-') AS jadwal,
                COALESCE(a.location, '-') AS location,
                COALESCE(r.saldo, 0.0) AS saldo,
                COALESCE(r.limit_saldo, 0.0) AS limit_saldo,
                COALESCE(r.markup, 0.0) AS markup,
                COALESCE(r.tgl_daftar, '-') AS tgl_daftar,
                COALESCE(r.tgl_aktivitas_terakhir, '-') AS tgl_aktivitas_terakhir,
                COALESCE(a.is_active, 1) AS is_active,
                CASE 
                    WHEN (r.leveling = 'AGEN' OR r.leveling = 'ROOT' OR r.kode_reseller = r.root_agen_id) THEN (
                        SELECT COUNT(*) FROM resellers c 
                        WHERE c.brand = r.brand AND c.root_agen_id = r.kode_reseller AND c.kode_reseller != r.kode_reseller
                    )
                    ELSE 0 
                END AS downlines_count
            FROM resellers r
            LEFT JOIN agents a ON r.brand = a.brand AND r.root_agen_id = a.agen_id
            WHERE {where_sql}
            ORDER BY r.kode_reseller ASC
            LIMIT ? OFFSET ?
        """
        cursor.execute(sql, tuple(params + [page_size, offset]))
        rows = []
        for r in cursor.fetchall():
            lev = "AGEN" if (r["leveling"] in ("AGEN", "ROOT") or r["kode_reseller"] == r["root_agen_id"]) else "DOWNLINE"
            rows.append({
                "agen_id": r["kode_reseller"],
                "kode_reseller": r["kode_reseller"],
                "nama_agen": r["nama_reseller"] or r["kode_reseller"],
                "nama_reseller": r["nama_reseller"] or r["kode_reseller"],
                "grup": r["grup"] or "-",
                "kode_upline": r["kode_upline"] or "-",
                "leveling": lev,
                "root_agen_id": r["root_agen_id"] or r["kode_reseller"],
                "nama_root_agen": r["nama_root_agen"] or "-",
                "cabang": r["cabang"],
                "type": r["type"] or "Prima",
                "sco": r["sco"] or "NON SCO",
                "dso": r["dso"] or "-",
                "jadwal": r["jadwal"] or "-",
                "location": r["location"] or "-",
                "saldo": r["saldo"] or 0.0,
                "limit_saldo": r["limit_saldo"] or 0.0,
                "markup": r["markup"] or 0.0,
                "tgl_daftar": r["tgl_daftar"] or "-",
                "tgl_aktivitas_terakhir": r["tgl_aktivitas_terakhir"] or "-",
                "downlines_count": r["downlines_count"],
                "is_active": r["is_active"]
            })

        total_pages = (total_count + page_size - 1) // page_size

        return {
            "brand": brand,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "rows": rows
        }


def get_agent_detail(brand: str, agen_id: str) -> dict:
    """Mengambil profil lengkap agen/reseller beserta daftar downline-nya."""
    brand = brand.upper()
    agen_id = agen_id.strip().upper()

    with get_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM agents WHERE brand = ? AND agen_id = ?", (brand, agen_id))
        agent = cursor.fetchone()
        
        cursor.execute("SELECT * FROM resellers WHERE brand = ? AND kode_reseller = ?", (brand, agen_id))
        reseller = cursor.fetchone()
        
        if not agent and not reseller:
            return {"found": False}

        reseller_dict = dict(reseller) if reseller else {}
        agent_dict = dict(agent) if agent else {}
        
        root_agent = None
        root_id = reseller_dict.get("root_agen_id") or agent_dict.get("agen_id") or agen_id
        if root_id and root_id != agen_id:
            cursor.execute("SELECT * FROM agents WHERE brand = ? AND agen_id = ?", (brand, root_id))
            r_ag = cursor.fetchone()
            if r_ag:
                root_agent = dict(r_ag)

        cursor.execute("""
            SELECT kode_reseller, nama_reseller, grup, kode_upline, leveling, saldo,
                   limit_saldo, markup, tgl_daftar, tgl_aktivitas_terakhir
            FROM resellers
            WHERE brand = ? AND root_agen_id = ? AND kode_reseller != ?
            ORDER BY kode_reseller ASC
            LIMIT 200
        """, (brand, agen_id, agen_id))
        downlines = [dict(r) for r in cursor.fetchall()]

        merged = {
            "agen_id": agen_id,
            "kode_reseller": agen_id,
            "nama_agen": agent_dict.get("nama_agen") or reseller_dict.get("nama_reseller") or agen_id,
            "nama_reseller": reseller_dict.get("nama_reseller") or agent_dict.get("nama_agen") or agen_id,
            "grup": reseller_dict.get("grup") or "P",
            "kode_upline": reseller_dict.get("kode_upline") or (root_agent.get("agen_id") if root_agent else "-"),
            "leveling": "AGEN" if (agent or reseller_dict.get("leveling") in ("AGEN", "ROOT") or reseller_dict.get("kode_reseller") == reseller_dict.get("root_agen_id")) else "DOWNLINE",
            "root_agen_id": root_id,
            "nama_root_agen": (root_agent.get("nama_agen") if root_agent else (agent_dict.get("nama_agen") or reseller_dict.get("nama_reseller"))),
            "cabang": agent_dict.get("cabang") or reseller_dict.get("cabang") or (root_agent.get("cabang") if root_agent else "BSD"),
            "type": agent_dict.get("type") or (root_agent.get("type") if root_agent else "Prima"),
            "sco": agent_dict.get("sco") or (root_agent.get("sco") if root_agent else "NON SCO"),
            "dso": agent_dict.get("dso") or (root_agent.get("dso") if root_agent else "-"),
            "jadwal": agent_dict.get("jadwal") or (root_agent.get("jadwal") if root_agent else "-"),
            "location": agent_dict.get("location") or (root_agent.get("location") if root_agent else "-"),
            "limit_saldo": agent_dict.get("limit_saldo") if agent_dict else reseller_dict.get("limit_saldo", 0.0),
            "saldo": reseller_dict.get("saldo", 0.0),
            "markup": reseller_dict.get("markup", 0.0),
            "tgl_daftar": agent_dict.get("tgl_daftar") or reseller_dict.get("tgl_daftar") or "-",
            "tgl_aktivitas_terakhir": agent_dict.get("tgl_aktivitas_terakhir") or reseller_dict.get("tgl_aktivitas_terakhir") or "-",
            "is_active": agent_dict.get("is_active", 1)
        }

        return {
            "found": True,
            "agent": merged,
            "downlines": downlines
        }


def lookup_upline_info(brand: str, upline_code: str) -> dict:
    """
    Lookup informasi Upline secara instan untuk form penambahan reseller/agen:
    1. Cek apakah upline adalah Branch Root (AR00001 - AR00007).
       - Khusus AR00005 (DEPO SEPATAN) otomatis dialihkan ke ICON (AR00003).
       - Khusus AR00007 (DEPO JASINGA) otomatis dialihkan ke PP (AR00002).
       - Khusus AR00006 otomatis Cabang ONLINE & SCO ONLINE.
       - Leveling otomatis: AGEN (Toko Induk).
    2. Cek apakah upline adalah Reseller / Toko Induk existing di database.
       - Leveling otomatis: DOWNLINE.
       - Mewarisi: Root Agen, Cabang, SCO, Tipe, Lokasi.
    """
    brand = brand.upper()
    up = (upline_code or "").strip().upper()
    if not up:
        return {"found": False, "error": "Kode Upline belum diisi"}

    # 1. Cek Branch Root ASTAGA
    if brand == "ASTAGA" and up in ASTAGA_BRANCH_MAP:
        raw_cab, action = ASTAGA_BRANCH_MAP[up]
        cabang = normalize_cabang(raw_cab)
        is_online = (cabang == "ONLINE")
        return {
            "found": True,
            "is_branch": True,
            "kode_upline": up,
            "nama_upline": f"Cabang {cabang} ({action})",
            "leveling": "AGEN",
            "cabang": cabang,
            "root_agen_id": None,
            "type": "Prima" if is_online else "Non Limit",
            "sco": "ONLINE" if is_online else "NON SCO",
            "dso": "-",
            "jadwal": "-",
            "location": "-" if is_online else "",
            "note": f"Upline adalah Branch Root {up} ({action}). Akun baru menjadi Agen Induk di Cabang {cabang}."
        }
    elif brand == "OKIPAY" and up in OKIPAY_BRANCH_MAP:
        raw_cab, action = OKIPAY_BRANCH_MAP[up]
        cabang = normalize_cabang(raw_cab)
        is_online = (cabang == "ONLINE")
        return {
            "found": True,
            "is_branch": True,
            "kode_upline": up,
            "nama_upline": f"Cabang {cabang} ({action})",
            "leveling": "AGEN",
            "cabang": cabang,
            "root_agen_id": None,
            "type": "Prima",
            "sco": "ONLINE" if is_online else "NON SCO",
            "dso": "-",
            "jadwal": "-",
            "location": "-",
            "note": f"Upline adalah Branch Root {up}. Akun baru menjadi Agen Induk di Cabang {cabang}."
        }

    # 2. Cek Reseller / Agen existing di database
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                r.kode_reseller, r.nama_reseller, r.grup, r.kode_upline, r.leveling,
                r.root_agen_id, COALESCE(a.nama_agen, r.nama_reseller) AS nama_root_agen,
                COALESCE(r.cabang, a.cabang, 'BSD') AS cabang,
                COALESCE(a.type, 'Prima') AS type,
                COALESCE(a.sco, 'NON SCO') AS sco,
                COALESCE(a.dso, '-') AS dso,
                COALESCE(a.jadwal, '-') AS jadwal,
                COALESCE(a.location, '-') AS location
            FROM resellers r
            LEFT JOIN agents a ON r.brand = a.brand AND r.root_agen_id = a.agen_id
            WHERE r.brand = ? AND r.kode_reseller = ?
        """, (brand, up))
        row = cursor.fetchone()
        if row:
            root_id = row["root_agen_id"] or row["kode_reseller"]
            return {
                "found": True,
                "is_branch": False,
                "kode_upline": row["kode_reseller"],
                "nama_upline": row["nama_reseller"],
                "leveling": "DOWNLINE",
                "root_agen_id": root_id,
                "nama_root_agen": row["nama_root_agen"],
                "cabang": row["cabang"],
                "type": row["type"],
                "sco": row["sco"],
                "dso": row["dso"],
                "jadwal": row["jadwal"],
                "location": row["location"],
                "note": f"Upline ditemukan ({row['nama_reseller']}). Akun baru menjadi Downline di bawah Toko Induk {root_id} - {row['nama_root_agen']}."
            }

    return {
        "found": False,
        "is_branch": False,
        "kode_upline": up,
        "error": f"Upline {up} tidak ditemukan di master cabang maupun master reseller."
    }


def save_reseller_account(brand: str, data: dict) -> dict:
    """
    Menyimpan atau memperbarui data reseller/agen ke database SQLite, menyelaraskan Parquet,
    dan mengekspor CSV Dimensi ke DMS RAW DATA agar Power Query langsung sinkron.
    """
    brand = brand.upper()
    code = (data.get("kode_reseller") or data.get("agen_id") or "").strip().upper()
    if not code:
        raise ValueError("Kode akun / reseller wajib diisi")

    nama = (data.get("nama_reseller") or data.get("nama_agen") or "").strip() or code
    grup = (data.get("grup") or "P").strip().upper()
    upline = (data.get("kode_upline") or "").strip().upper() or None
    leveling = (data.get("leveling") or "AGEN").strip().upper()
    if leveling not in ("AGEN", "DOWNLINE", "ROOT"):
        leveling = "AGEN"
    if leveling == "ROOT":
        leveling = "AGEN"

    cabang = normalize_cabang(data.get("cabang", "BSD"))

    # Limit Saldo & Tipe Reseller
    raw_limit = data.get("limit_saldo", 0.0)
    try:
        limit_val = float(raw_limit or 0.0)
    except (ValueError, TypeError):
        limit_val = 0.0

    if limit_val > 0:
        limit_saldo = -abs(limit_val)
    elif limit_val < 0:
        limit_saldo = limit_val
    else:
        limit_saldo = 0.0

    typ = me.classify_astaga_agent_type(
        limit_saldo=limit_saldo,
        cabang=cabang,
        existing_type=data.get("type", "")
    )
    sco = me.normalize_astaga_sco(cabang, data.get("sco", "NON SCO"))
    dso = (data.get("dso") or "").strip() or "-"
    jadwal = (data.get("jadwal") or "").strip() or "-"
    location = (data.get("location") or "").strip() or "-"
    markup = float(data.get("markup", 0.0) or 0.0)
    saldo = float(data.get("saldo", 0.0) or 0.0)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Tentukan root_agen_id
    if leveling == "AGEN":
        root_agen_id = code
    else:
        root_agen_id = (data.get("root_agen_id") or "").strip().upper()
        if not root_agen_id and upline:
            with get_connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT root_agen_id, cabang FROM resellers WHERE brand = ? AND kode_reseller = ?", (brand, upline))
                up_row = cur.fetchone()
                if up_row:
                    root_agen_id = up_row["root_agen_id"] or upline
                    if not cabang or cabang == "BSD":
                        cabang = up_row["cabang"] or cabang
                else:
                    root_agen_id = upline

    with get_connection() as conn:
        cursor = conn.cursor()

        # 1. Simpan ke tabel resellers
        cursor.execute("""
            INSERT INTO resellers (
                brand, kode_reseller, nama_reseller, grup, kode_upline, root_agen_id, cabang, leveling,
                saldo, limit_saldo, markup, tgl_daftar, tgl_aktivitas_terakhir, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?,
                COALESCE(?, (SELECT tgl_daftar FROM resellers WHERE brand = ? AND kode_reseller = ?), strftime('%Y-%m-%d %H:%M:%S', 'now')),
                COALESCE(?, (SELECT tgl_aktivitas_terakhir FROM resellers WHERE brand = ? AND kode_reseller = ?), strftime('%Y-%m-%d %H:%M:%S', 'now')),
                ?
            )
            ON CONFLICT(brand, kode_reseller) DO UPDATE SET
                nama_reseller = excluded.nama_reseller,
                grup = excluded.grup,
                kode_upline = excluded.kode_upline,
                root_agen_id = excluded.root_agen_id,
                cabang = excluded.cabang,
                leveling = excluded.leveling,
                limit_saldo = excluded.limit_saldo,
                markup = excluded.markup,
                updated_at = excluded.updated_at
        """, (
            brand, code, nama, grup, upline, root_agen_id, cabang, leveling,
            saldo, limit_saldo, markup,
            data.get("tgl_daftar"), brand, code,
            data.get("tgl_aktivitas_terakhir"), brand, code,
            now_str
        ))

        # 2. Jika level AGEN (Toko Induk), simpan ke tabel agents & propagasikan ke downlines
        if leveling == "AGEN":
            cursor.execute("""
                INSERT INTO agents (
                    brand, agen_id, nama_agen, cabang, type, sco, dso,
                    limit_saldo, markup, jadwal, location, is_active, updated_at,
                    tgl_daftar
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?,
                    COALESCE(
                        ?,
                        (SELECT tgl_daftar FROM agents WHERE brand = ? AND agen_id = ?),
                        (SELECT tgl_daftar FROM resellers WHERE brand = ? AND kode_reseller = ?),
                        strftime('%Y-%m-%d %H:%M:%S', 'now')
                    )
                )
                ON CONFLICT(brand, agen_id) DO UPDATE SET
                    nama_agen = excluded.nama_agen,
                    cabang = excluded.cabang,
                    type = excluded.type,
                    sco = excluded.sco,
                    dso = excluded.dso,
                    limit_saldo = excluded.limit_saldo,
                    markup = excluded.markup,
                    jadwal = excluded.jadwal,
                    location = excluded.location,
                    is_active = excluded.is_active,
                    updated_at = excluded.updated_at
            """, (
                brand, code, nama, cabang, typ, sco, dso,
                limit_saldo, markup, jadwal, location, now_str,
                data.get("tgl_daftar"), brand, code, brand, code
            ))

            # Update juga cabang semua reseller yang bernaung di bawah root_agen_id ini
            cursor.execute("""
                UPDATE resellers
                SET cabang = ?, updated_at = ?
                WHERE brand = ? AND root_agen_id = ?
            """, (cabang, now_str, brand, code))

        conn.commit()

    # Sync Parquet & Export Dim CSVs
    sync_to_parquet(brand)
    export_dim_csvs_to_dms(brand)

    try:
        import engines.customer_engine as ce
        ce.clear_cache()
    except Exception:
        pass

    try:
        import engines.overview_engine as oe
        oe.clear_unmapped_cache()
    except Exception:
        pass

    return {
        "ok": True,
        "agen_id": code,
        "kode_reseller": code,
        "nama_reseller": nama,
        "leveling": leveling,
        "cabang": cabang,
        "sco": sco,
        "root_agen_id": root_agen_id
    }


def save_agent(brand: str, agen_id: str, data: dict) -> dict:
    """Wrapper kompatibilitas untuk menyimpan data agen/reseller."""
    data["agen_id"] = agen_id
    data["kode_reseller"] = agen_id
    return save_reseller_account(brand, data)



def export_master_excel(brand: str) -> str:
    """Meng-generate file Excel master customer dari database SQLite (baik statis untuk Power Query maupun timestamp)."""
    brand = brand.upper()
    export_filename = f"MASTER_CUSTOMER_{brand}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    export_path = os.path.join(MASTER_DIR, export_filename)
    static_path = os.path.join(MASTER_DIR, f"MASTER_CUSTOMER_{brand}.xlsx")

    with get_connection() as conn:
        df_agents = pd.read_sql_query("""
            SELECT agen_id AS [AGEN ID], nama_agen AS [NAMA AGEN], cabang AS [CABANG],
                   type AS [TYPE], sco AS [SCO], dso AS [DSO], limit_saldo AS [LIMIT SALDO],
                   markup AS [MARKUP], tgl_daftar AS [TGL DAFTAR], tgl_aktivitas_terakhir AS [TGL AKTIF],
                   jadwal AS [JADWAL], location AS [LOCATION], kota_kab AS [KOTA/KAB],
                   kecamatan AS [KECAMATAN], kelurahan AS [KELURAHAN]
            FROM agents WHERE brand = ? ORDER BY agen_id
        """, conn, params=(brand,))

        df_resellers = pd.read_sql_query("""
            SELECT kode_reseller AS [Kode Reseller], nama_reseller AS [Reseller Name],
                   grup AS [Group], kode_upline AS [Upline], root_agen_id AS [Agen id],
                   cabang AS [Cabang], leveling AS [Leveling], saldo AS [Saldo],
                   limit_saldo AS [Limit Saldo], markup AS [Markup],
                   tgl_daftar AS [Tgl Daftar], tgl_aktivitas_terakhir AS [Tgl Aktivitas Terakhir]
            FROM resellers WHERE brand = ? ORDER BY kode_reseller
        """, conn, params=(brand,))

    # Tulis ke file statis (single file target untuk Power Query)
    with pd.ExcelWriter(static_path, engine="openpyxl") as writer:
        df_agents.to_excel(writer, sheet_name="Mapping_Agen", index=False)
        df_resellers.to_excel(writer, sheet_name="Reseller", index=False)

    # Salin ke file bertimestamp jika dibutuhkan history / unduhan browser
    try:
        import shutil
        shutil.copy2(static_path, export_path)
    except Exception:
        pass

    return static_path


def run_full_migration():
    """Menjalankan inisialisasi & migrasi penuh."""
    t0 = time.time()
    print("=== MEMULAI MIGRASI MASTER DATA KE DATABASE SQLITE ===")
    init_db()
    migrate_astaga()
    migrate_okipay()
    sync_to_parquet("ALL")
    print(f"=== MIGRASI SELESAI SUKSES DALAM {time.time() - t0:.2f} DETIK ===")


if __name__ == "__main__":
    run_full_migration()
