"""
transaction_engine.py
Membaca file transaksi Excel dari C:\\RAW DATA (ASTAGA & OKIPAY),
sheet GROSS, 10 kolom yang disepakati, lalu cache ke parquet.

Engine: openpyxl read_only=True + iter_rows() → cepat untuk file besar.

Kolom output (unified):
  trx_id, tgl_entry, product_id, qty, ar_id,
  modul_id, status, tgl_stat, beli, jual
"""

import os
import glob
import pandas as pd
import openpyxl
from datetime import datetime

try:
    import engines.telemetry_engine as telemetry
except Exception:
    telemetry = None

# ─── Konfigurasi Path ────────────────────────────────────────────────────────
RAW_DATA_ROOT = r"C:\RAW DATA"
CACHE_DIR     = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")

# ─── Mapping kolom per brand ─────────────────────────────────────────────────
BRAND_CONFIG = {
    "ASTAGA": {
        "subfolder": "ASTAGA",
        "col_map": {
            "TRX_ID":    "trx_id",
            "TGL.ENTRY": "tgl_entry",
            "PRODUCT_ID":"product_id",
            "QTY":       "qty",
            "AR_ID":     "ar_id",
            "MODUL_ID":  "modul_id",
            "STATUS":    "status",
            "TGL.STAT":  "tgl_stat",
            "BELI":      "beli",
            "JUAL":      "jual",
        },
    },
    "OKIPAY": {
        "subfolder": "OKIPAY",
        "col_map": {
            "TRX ID":       "trx_id",
            "TGL ENTRI":    "tgl_entry",
            "KODE PRODUK":  "product_id",
            "QTY":          "qty",
            "KODE RESELLER":"ar_id",
            "MODUL_ID":     "modul_id",
            "STAT":         "status",
            "TGL STAT":     "tgl_stat",
            "HARGA BELI":   "beli",
            "HARGA JUAL":   "jual",
        },
    },
}

UNIFIED_COLS = ["trx_id", "tgl_entry", "product_id", "qty",
                "ar_id", "modul_id", "status", "tgl_stat", "beli", "jual"]

COLUMN_ALIASES = {
    "trx_id": {"TRX_ID", "TRX ID", "TRXID", "ID", "NO TRX", "NO_TRX", "TRX.ID", "TX ID", "TX_ID", "ID_TRX", "ID TRX"},
    "tgl_entry": {"TGL.ENTRY", "TGL ENTRY", "TGL ENTRI", "TGL", "TGL_ENTRY", "DATE", "TANGGAL", "ENTRI", "TGL. ENTRI", "TGL_"},
    "product_id": {"PRODUCT_ID", "KODE PRODUK", "PRODUCT", "PRODUK", "PROD", "PROD_ID", "PRODUK_ID", "KODE_PRODUK"},
    "qty": {"QTY", "JUMLAH"},
    "ar_id": {"AR_ID", "KODE RESELLER", "AR ID", "ARID", "KODE_RESELLER", "RESELLER_ID", "KODE RS", "RS ID", "RS_ID", "KODE_RS"},
    "modul_id": {"MODUL_ID", "MODUL", "KODE MODUL"},
    "status": {"STATUS", "STAT", "STATUS TRX"},
    "tgl_stat": {"TGL.STAT", "TGL STAT", "TGL_STAT"},
    "beli": {"BELI", "HARGA BELI", "HRG BELI", "HARGA_BELI", "HRG. BELI", "HTG. BELI"},
    "jual": {"JUAL", "HARGA JUAL", "HRG JUAL", "HARGA_JUAL", "HRG. JUAL", "RP"},
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _cache_path(brand: str, year: str) -> str:
    return os.path.join(CACHE_DIR, f"trx_{brand.lower()}_{year}.parquet")


def _detect_sheet_and_header(xlsx_path: str) -> tuple[str | None, int]:
    """
    Deteksi nama sheet transaksi dan baris index header (0-indexed).
    Mendukung format GROSS (2026), NET/transaksi bersih (2025, dsb),
    serta file dengan offset header (misal header di baris 2).
    Abaikan sheet ringkasan pivot (yang berisi 'SUM OF', 'COUNT OF').
    """
    id_aliases = COLUMN_ALIASES["trx_id"]
    prod_aliases = COLUMN_ALIASES["product_id"]
    ar_aliases = COLUMN_ALIASES["ar_id"]

    try:
        wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
        best_candidate = None
        for s in wb.sheetnames:
            ws = wb[s]
            for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=5, values_only=True)):
                row_vals = [str(x).strip().upper() for x in row if x is not None]
                if any("SUM OF" in x or "COUNT OF" in x for x in row_vals):
                    continue
                has_id = any(x in id_aliases for x in row_vals)
                has_prod = any(x in prod_aliases for x in row_vals)
                has_ar = any(x in ar_aliases for x in row_vals)
                if has_id and (has_prod or has_ar):
                    best_candidate = (s, row_idx)
                    break
            if best_candidate and any(k in s.upper() for k in ["GROSS", "NET", "BERSIH"]):
                break
        wb.close()
        if best_candidate:
            return best_candidate
    except Exception as e:
        print(f"  [WARN] Gagal deteksi sheet {os.path.basename(xlsx_path)}: {e}")
    return (None, 0)


def _detect_sheet_name(xlsx_path: str, col_map: dict = None) -> str | None:
    """Wrapper kompatibilitas mundur untuk deteksi nama sheet."""
    s, _ = _detect_sheet_and_header(xlsx_path)
    return s


def _read_gross_fast(xlsx_path: str, col_map: dict = None) -> pd.DataFrame:
    """
    Hybrid: openpyxl read_only untuk deteksi sheet dan header,
    lalu calamine untuk baca data penuh — mendukung 2026, 2025, dan data historis.
    """
    target_sheet, header_row = _detect_sheet_and_header(xlsx_path)
    if target_sheet is None:
        print(f"  [SKIP] Sheet transaksi tidak ditemukan: {os.path.basename(xlsx_path)}")
        return pd.DataFrame()

    try:
        df = pd.read_excel(
            xlsx_path,
            sheet_name=target_sheet,
            engine="calamine",
            header=header_row,
        )
    except Exception as e:
        print(f"  [ERROR] calamine gagal baca {os.path.basename(xlsx_path)}: {e}")
        return pd.DataFrame()

    if df.empty:
        return df

    # Map kolom secara fleksibel
    col_mapping = {}
    for col in df.columns:
        norm = str(col).strip().upper()
        for target, aliases in COLUMN_ALIASES.items():
            if norm in aliases and target not in col_mapping.values():
                col_mapping[col] = target
                break
    df = df.rename(columns=col_mapping)

    # Pastikan semua unified columns ada
    for col in UNIFIED_COLS:
        if col not in df.columns:
            df[col] = None

    # Default status & tgl_stat untuk file transaksi bersih (seperti data < 2026)
    if df["status"].isna().all() or (df["status"].astype(str).str.strip() == "").all():
        df["status"] = "Sukses"
    else:
        df["status"] = df["status"].fillna("Sukses")

    if df["tgl_stat"].isna().all() or (df["tgl_stat"].astype(str).str.strip() == "").all():
        df["tgl_stat"] = df["tgl_entry"]
    else:
        df["tgl_stat"] = df["tgl_stat"].fillna(df["tgl_entry"])

    df = df[UNIFIED_COLS]

    # Buang baris kosong
    df = df.dropna(subset=["trx_id"])
    df = df[df["trx_id"].astype(str).str.strip().ne("")]

    return df


# ─── Public API ──────────────────────────────────────────────────────────────

def get_available_years(brand: str) -> list[str]:
    """Kembalikan list tahun yang tersedia (dari Parquet cache atau folder RAW DATA)."""
    years = set()
    prefix = f"trx_{brand.lower()}_"
    if os.path.isdir(CACHE_DIR):
        for f in os.listdir(CACHE_DIR):
            if f.startswith(prefix) and f.endswith(".parquet"):
                y_str = f[len(prefix):-8]
                if y_str.isdigit() and len(y_str) == 4:
                    years.add(y_str)

    cfg = BRAND_CONFIG.get(brand.upper(), {})
    sub = cfg.get("subfolder")
    if sub:
        base = os.path.join(RAW_DATA_ROOT, sub)
        if os.path.isdir(base):
            for d in os.listdir(base):
                if os.path.isdir(os.path.join(base, d)) and d.isdigit() and len(d) == 4:
                    years.add(d)

    return sorted(list(years), reverse=True)


def _mini_cache_path(brand: str, year: str, xlsx_basename: str) -> str:
    """Path cache parquet per file bulanan, misal: .cache/parts/astaga_2026_0126.parquet"""
    parts_dir = os.path.join(CACHE_DIR, "parts")
    name = f"{brand.lower()}_{year}_{os.path.splitext(xlsx_basename)[0]}.parquet"
    return os.path.join(parts_dir, name)


def build_cache(brand: str, year: str, force: bool = False) -> dict:
    """
    Baca file Excel tahun tertentu → gabung → simpan ke parquet.
    INCREMENTAL: hanya baca ulang file yang berubah (mtime lebih baru dari mini-cache).
    """
    brand   = brand.upper()
    cfg     = BRAND_CONFIG[brand]
    col_map = cfg["col_map"]
    folder  = os.path.join(RAW_DATA_ROOT, cfg["subfolder"], year)
    out     = _cache_path(brand, year)

    if not os.path.isdir(folder):
        return {"success": False, "error": f"Folder tidak ditemukan: {folder}"}

    xlsx_files = sorted(glob.glob(os.path.join(folder, "*.xlsx")))
    xlsx_files = [f for f in xlsx_files
                  if "TEMPLATE" not in os.path.basename(f).upper()
                  and not os.path.basename(f).startswith("~$")]

    if not xlsx_files:
        return {"success": False, "error": f"Tidak ada file Excel di {folder}"}

    # Cek apakah SEMUA cache masih valid (combined + semua mini-cache)
    if not force and os.path.exists(out):
        cache_mtime = os.path.getmtime(out)
        if all(os.path.getmtime(f) <= cache_mtime for f in xlsx_files):
            row_count = pd.read_parquet(out).shape[0]
            return {
                "success": True, "cached": True,
                "brand": brand, "year": year, "rows": row_count,
                "message": "Cache masih valid, tidak perlu rebuild.",
            }

    # INCREMENTAL: cek per file, hanya baca yang berubah
    os.makedirs(os.path.join(CACHE_DIR, "parts"), exist_ok=True)
    frames = []
    files_read = 0
    files_cached = 0
    t_start = datetime.now()

    for f in xlsx_files:
        fname = os.path.basename(f)
        mini = _mini_cache_path(brand, year, fname)

        # Cek apakah mini-cache masih valid untuk file ini
        if not force and os.path.exists(mini) and os.path.getmtime(mini) >= os.path.getmtime(f):
            # Mini-cache valid → pakai langsung (instan)
            df = pd.read_parquet(mini)
            frames.append(df)
            files_cached += 1
            log_msg = f"[CACHE] {brand}/{year} -- {fname} -> {len(df):,} baris (instan)"
            print(f"  {log_msg}")
            if telemetry:
                telemetry.log(log_msg, state="idle")
        else:
            # File baru/berubah → baca dari Excel
            size_mb = os.path.getsize(f) / (1024 * 1024)
            read_msg = f"[READ]  {brand}/{year} -- {fname} ({size_mb:.1f} MB)"
            print(f"  {read_msg}")
            if telemetry:
                telemetry.set_busy(f"Membaca {fname}...", f"{brand} {year} ({size_mb:.1f} MB)")
                telemetry.log(read_msg, state="busy")

            t0 = datetime.now()
            df = _read_gross_fast(f, col_map)
            elapsed = (datetime.now() - t0).total_seconds()

            if not df.empty:
                df["_source_file"] = fname

                # Konversi tipe data per file (agar mini-cache sudah bersih)
                for col in ["tgl_entry", "tgl_stat"]:
                    if col in df.columns:
                        df[col] = pd.to_datetime(df[col], errors="coerce")
                for col in ["qty", "beli", "jual"]:
                    if col in df.columns:
                        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
                for col in ["ar_id", "product_id", "status", "modul_id"]:
                    if col in df.columns:
                        df[col] = df[col].astype(str).str.replace("\xa0", "", regex=False).str.strip()

                # Aturan Conditional: Buang Hrg. Jual 0 dan Hrg. Jual 1 untuk OKIPAY
                if brand == "OKIPAY" and "jual" in df.columns:
                    df = df[(df["jual"] != 0) & (df["jual"] != 1)]

                # Aturan Takeout Akun Internal ASTAGA: AR00037, AR00009, AR20408
                if brand == "ASTAGA" and "ar_id" in df.columns:
                    df = df[~df["ar_id"].astype(str).str.strip().str.upper().isin(["AR00037", "AR00009", "AR20408"])]

                # Simpan mini-cache
                df.to_parquet(mini, index=False)
                frames.append(df)
                files_read += 1
                res_msg = f"          -> {len(df):,} baris, {elapsed:.1f}s"
                print(res_msg)
                if telemetry:
                    telemetry.log(res_msg, state="busy")
            else:
                files_read += 1
                res_msg = f"          -> kosong, {elapsed:.1f}s"
                print(res_msg)
                if telemetry:
                    telemetry.log(res_msg, state="busy")

    if not frames:
        if telemetry:
            telemetry.set_idle(f"Error {brand} {year}: Tidak ada data", "Gagal membaca")
        return {"success": False, "error": "Tidak ada data berhasil dibaca."}

    if telemetry and files_read > 0:
        telemetry.set_busy(f"Menggabungkan Parquet {brand} {year}...", f"{len(frames)} file")

    combined = pd.concat(frames, ignore_index=True)

    # Aturan Conditional: Pastikan OKIPAY bersih dari jual == 0 dan jual == 1
    if brand == "OKIPAY" and "jual" in combined.columns:
        combined = combined[(combined["jual"] != 0) & (combined["jual"] != 1)]

    # Aturan Takeout Akun Internal ASTAGA: AR00037, AR00009, AR20408
    if brand == "ASTAGA" and "ar_id" in combined.columns:
        combined = combined[~combined["ar_id"].astype(str).str.strip().str.upper().isin(["AR00037", "AR00009", "AR20408"])]

    # Pastikan tipe data konsisten di combined
    for col in ["tgl_entry", "tgl_stat"]:
        combined[col] = pd.to_datetime(combined[col], errors="coerce")
    for col in ["qty", "beli", "jual"]:
        combined[col] = pd.to_numeric(combined[col], errors="coerce").fillna(0)

    os.makedirs(CACHE_DIR, exist_ok=True)
    combined.to_parquet(out, index=False)

    total_sec = (datetime.now() - t_start).total_seconds()
    msg = (f"Incremental: {files_read} file dibaca, {files_cached} dari cache, "
           f"{len(combined):,} baris dalam {total_sec:.0f} detik.")
    print(f"  [OK] {msg}")
    if telemetry:
        telemetry.log(f"[OK] {msg}", state="success")
        telemetry.set_idle(f"Parquet {brand} {year} Sinkron", f"{len(combined):,} baris")
    return {
        "success": True, "cached": False,
        "brand": brand, "year": year,
        "rows": len(combined), "files_read": files_read,
        "files_cached": files_cached,
        "elapsed_sec": round(total_sec, 1),
        "message": msg,
    }


# ─── In-Memory RAM Cache (Instan < 0.001s) ──────────────────────────────────
_MEMORY_CACHE: dict = {}
_MEMORY_MTIME: dict = {}

def clear_memory_cache(brand: str = None, year: str = None):
    """Bersihkan cache memori jika cache di-rebuild."""
    global _MEMORY_CACHE, _MEMORY_MTIME
    if brand and year:
        _MEMORY_CACHE.pop((brand.upper(), str(year)), None)
        _MEMORY_MTIME.pop((brand.upper(), str(year)), None)
    else:
        _MEMORY_CACHE.clear()
        _MEMORY_MTIME.clear()


def load(brand: str, year: str) -> pd.DataFrame:
    """Load dari RAM jika valid, atau baca dari cache parquet. Auto-build jika file Excel lebih baru."""
    brand = brand.upper()
    year = str(year)
    key = (brand, year)
    path = _cache_path(brand, year)

    # 1. Cek apakah ada di RAM dan file parquet belum berubah
    if os.path.exists(path):
        mtime = os.path.getmtime(path)
        if key in _MEMORY_CACHE and _MEMORY_MTIME.get(key) == mtime:
            return _MEMORY_CACHE[key]

    # 2. Cek/build jika perlu
    result = build_cache(brand, year, force=False)
    if not result.get("success", False):
        if not os.path.exists(path):
            raise FileNotFoundError(result.get("error", "Gagal memuat cache"))

    # 3. Muat ke RAM & pre-hitung kolom pembantu (ym, is_sukses)
    df = pd.read_parquet(path)
    if brand == "ASTAGA" and "ar_id" in df.columns:
        df = df[~df["ar_id"].astype(str).str.strip().str.upper().isin(["AR00037", "AR00009", "AR20408"])]
    if "is_sukses" not in df.columns and "status" in df.columns:
        df["is_sukses"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False)
    if "ym" not in df.columns and "tgl_entry" in df.columns:
        # Fast extraction (0.3s vs 28s)
        ym_int = df["tgl_entry"].dt.year * 100 + df["tgl_entry"].dt.month
        unique_ym = ym_int.dropna().unique()
        ym_map = {val: f"{int(val) // 100}-{int(val) % 100:02d}" for val in unique_ym}
        df["ym"] = ym_int.map(ym_map)

    _MEMORY_CACHE[key] = df
    _MEMORY_MTIME[key] = os.path.getmtime(path)
    return df


def get_status() -> dict:
    """Ringkasan status cache semua brand & tahun."""
    status = {}
    for brand in BRAND_CONFIG:
        status[brand] = {}
        try:
            years = get_available_years(brand)
        except Exception:
            years = []
        for year in years:
            path = _cache_path(brand, year)
            if os.path.exists(path):
                df = pd.read_parquet(path)
                status[brand][year] = {
                    "cached":  True,
                    "rows":    len(df),
                    "size_mb": round(os.path.getsize(path) / (1024 * 1024), 2),
                }
            else:
                status[brand][year] = {"cached": False, "rows": 0}
    return status
