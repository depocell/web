"""
engines/admin_engine.py
Engine untuk Menu Utama Admin Data.
Fungsi:
1. Melacak status raw data saat ini (cut-off tanggal, total baris, last TrxID).
2. Radar deteksi file TSV baru dari OtomaX di C:\\RAW DATA\\<BRAND>\\2026.
3. Simulasi filter (conditional upsert) & kalkulasi breakdown data sampah vs bersih.
4. Eksekusi Upsert aman:
   - Auto-backup (.xlsx.bak)
   - Upsert ke file Excel bulanan (update status transaksi lama jika ada & insert transaksi baru)
   - Sinkronisasi cache Parquet otomatis
   - Pembersihan / penghapusan file TSV yang telah selesai
"""

import os
import glob
import time
import shutil
import uuid
import threading
from datetime import datetime
import pandas as pd
import openpyxl

import engines.transaction_engine as trx_engine

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DATA_ROOT = r"C:\RAW DATA"

# Menyimpan riwayat & status job background
ADMIN_JOBS = {}
_WATERMARK_CACHE = {}


def get_current_watermark(brand: str, year: str = "2026") -> dict:
    """
    Mengambil informasi cut-off terakhir dari raw data Excel bulan berjalan.
    Memanfaatkan cache Parquet super cepat jika sudah ada, atau cache RAM mtime.
    """
    brand = brand.upper()
    subfolder = "ASTAGA" if brand == "ASTAGA" else "OKIPAY"
    folder = os.path.join(RAW_DATA_ROOT, subfolder, year)

    # File bulan berjalan (contoh: 1026.xlsx untuk ASTAGA, OP1026.xlsx untuk OKIPAY)
    target_pattern = "*1026.xlsx"
    files = glob.glob(os.path.join(folder, target_pattern))
    files = [f for f in files if not os.path.basename(f).startswith("~$") and not f.endswith(".bak") and not f.endswith("_test.xlsx")]

    if not files and os.path.exists(folder):
        # Fallback ke file excel terbaru
        all_files = sorted(glob.glob(os.path.join(folder, "*.xlsx")))
        files = [f for f in all_files if "TEMPLATE" not in os.path.basename(f).upper() and not os.path.basename(f).startswith("~$") and not f.endswith(".bak")]

    if not files:
        # Fallback langsung ke cache Parquet (terutama di VPS yang tidak menyimpan raw Excel)
        p_cache = os.path.join(BASE_DIR, ".cache", f"trx_{brand.lower()}_{year}.parquet")
        if os.path.exists(p_cache):
            file_mtime = os.path.getmtime(p_cache)
            file_size = os.path.getsize(p_cache)
            cache_key = (p_cache, file_mtime, file_size)
            if cache_key in _WATERMARK_CACHE:
                return _WATERMARK_CACHE[cache_key]
            try:
                import pyarrow.parquet as pq
                pf = pq.ParquetFile(p_cache)
                num_rows = pf.metadata.num_rows

                # Baca tanggal awal dari row group pertama
                t_first = pf.read_row_group(0, columns=['tgl_entry'])
                first_date = str(t_first['tgl_entry'][0].as_py())

                # Baca tanggal akhir dan trx_id terakhir dari row group terakhir
                t_last = pf.read_row_group(pf.num_row_groups - 1, columns=['tgl_entry', 'trx_id'])
                last_date = str(t_last['tgl_entry'][-1].as_py())
                raw_id = t_last['trx_id'][-1].as_py()
                try:
                    last_id = int(raw_id) if raw_id is not None and str(raw_id).isdigit() else str(raw_id)
                except Exception:
                    last_id = str(raw_id) if raw_id is not None else None

                def_name = "1026.xlsx" if brand == "ASTAGA" else "OP1026.xlsx"
                res = {
                    "file": f"{def_name} (Parquet Sinkron)",
                    "path": p_cache,
                    "exists": True,
                    "total_rows": int(num_rows),
                    "min_date": first_date,
                    "max_date": last_date,
                    "last_trx_id": last_id,
                    "file_size_mb": round(file_size / (1024 * 1024), 2),
                    "mtime": datetime.fromtimestamp(file_mtime).strftime("%Y-%m-%d %H:%M:%S")
                }
                _WATERMARK_CACHE[cache_key] = res
                return res
            except Exception:
                pass

        return {
            "file": None,
            "exists": False,
            "total_rows": 0,
            "min_date": None,
            "max_date": None,
            "last_trx_id": None
        }

    target_file = files[-1]
    filename = os.path.basename(target_file)
    file_mtime = os.path.getmtime(target_file)
    file_size = os.path.getsize(target_file)
    cache_key = (target_file, file_mtime, file_size)

    if cache_key in _WATERMARK_CACHE:
        return _WATERMARK_CACHE[cache_key]

    # 1. Coba baca super cepat dari cache Parquet jika sudah tersinkronisasi
    p_cache = os.path.join(BASE_DIR, ".cache", f"trx_{brand.lower()}_{year}.parquet")
    if os.path.exists(p_cache) and os.path.getmtime(p_cache) >= (file_mtime - 60):
        try:
            import re
            m = re.search(r"(\d{2})26", filename)
            month_code = m.group(1) if m else "10"
            target_ym = f"{year}-{month_code}"

            df = trx_engine.load(brand, year)
            if df is not None and not df.empty:
                df_m = df[df["ym"] == target_ym] if "ym" in df.columns else df[df["tgl_entry"].dt.strftime("%Y-%m") == target_ym]
                if not df_m.empty:
                    min_date = df_m["tgl_entry"].min()
                    max_date = df_m["tgl_entry"].max()
                    raw_id = df_m["trx_id"].iloc[-1] if "trx_id" in df_m.columns else None
                    try:
                        last_id = int(raw_id) if (raw_id is not None and pd.notna(raw_id)) else None
                    except Exception:
                        last_id = str(raw_id) if raw_id is not None else None

                    res = {
                        "file": filename,
                        "path": target_file,
                        "exists": True,
                        "total_rows": int(len(df_m)),
                        "min_date": str(min_date) if min_date else None,
                        "max_date": str(max_date) if max_date else None,
                        "last_trx_id": last_id,
                        "file_size_mb": round(file_size / (1024 * 1024), 2),
                        "mtime": datetime.fromtimestamp(file_mtime).strftime("%Y-%m-%d %H:%M:%S")
                    }
                    _WATERMARK_CACHE[cache_key] = res
                    return res
        except Exception:
            pass

    # 2. Fallback baca via openpyxl jika belum terindeks di Parquet
    try:
        wb = openpyxl.load_workbook(target_file, read_only=True)
        sheet_name = "GROSS" if "GROSS" in wb.sheetnames else wb.sheetnames[0]
        ws = wb[sheet_name]
        total_rows = int(ws.max_row - 1) if ws.max_row and ws.max_row > 1 else 0

        # Ambil baris pertama data dan baris terakhir data
        first_row = None
        for r in ws.iter_rows(min_row=2, max_row=2, values_only=True):
            first_row = r
            break

        # Cari baris terakhir yang terisi (scan mundur)
        last_row = None
        if ws.max_row and ws.max_row > 1:
            start_r = max(2, ws.max_row - 15)
            rows_chunk = list(ws.iter_rows(min_row=start_r, max_row=ws.max_row, values_only=True))
            for r in reversed(rows_chunk):
                if r and r[0] is not None and len(r) > 1 and r[1] is not None:
                    last_row = r
                    break
            if last_row is None and rows_chunk:
                last_row = rows_chunk[-1]

        wb.close()

        min_date = first_row[1] if first_row and len(first_row) > 1 else None
        max_date = last_row[1] if last_row and len(last_row) > 1 else None
        raw_trx_id = last_row[0] if last_row and len(last_row) > 0 else None
        try:
            last_trx_id = int(raw_trx_id) if raw_trx_id is not None and str(raw_trx_id).isdigit() else str(raw_trx_id) if raw_trx_id is not None else None
        except Exception:
            last_trx_id = str(raw_trx_id) if raw_trx_id is not None else None

        res = {
            "file": filename,
            "path": target_file,
            "exists": True,
            "total_rows": total_rows,
            "min_date": str(min_date) if min_date else None,
            "max_date": str(max_date) if max_date else None,
            "last_trx_id": last_trx_id,
            "file_size_mb": round(file_size / (1024 * 1024), 2),
            "mtime": datetime.fromtimestamp(file_mtime).strftime("%Y-%m-%d %H:%M:%S")
        }
        _WATERMARK_CACHE[cache_key] = res
        return res
    except Exception as e:
        return {
            "file": filename,
            "path": target_file,
            "exists": True,
            "error": str(e),
            "total_rows": 0
        }


def scan_tsv_incoming(brand: str, year: str = "2026") -> dict:
    """
    Memindai folder C:\\RAW DATA\\<BRAND>\\<YEAR> untuk file .tsv incoming dari OtomaX.
    """
    brand = brand.upper()
    subfolder = "ASTAGA" if brand == "ASTAGA" else "OKIPAY"
    folder = os.path.join(RAW_DATA_ROOT, subfolder, year)

    if not os.path.exists(folder):
        return {"found": False, "files": []}

    tsv_files = sorted(glob.glob(os.path.join(folder, "*.tsv")))
    if not tsv_files:
        return {"found": False, "files": []}

    details = []
    for f in tsv_files:
        fname = os.path.basename(f)
        sz_bytes = os.path.getsize(f)
        sz_mb = round(sz_bytes / (1024 * 1024), 2)
        mtime_str = datetime.fromtimestamp(os.path.getmtime(f)).strftime("%Y-%m-%d %H:%M:%S")

        try:
            df = pd.read_csv(f, sep="\t")
            total_raw = len(df)
            min_date = str(df["Tgl. Entri"].min()) if "Tgl. Entri" in df.columns else "-"
            max_date = str(df["Tgl. Entri"].max()) if "Tgl. Entri" in df.columns else "-"
            min_trx = int(df["TrxID"].min()) if "TrxID" in df.columns else 0
            max_trx = int(df["TrxID"].max()) if "TrxID" in df.columns else 0

            # Hitung breakdown filter
            zero_jual = (df["Hrg. Jual"] == 0) | (df["Hrg. Jual"].isna())
            status_lower = df["Status"].astype(str).str.lower().str.strip()
            bad_status = (
                status_lower.str.contains("saldo tidak cukup", na=False) |
                status_lower.str.contains("diluar wilayah", na=False) |
                status_lower.str.contains("tujuan salah", na=False)
            )

            if brand == "ASTAGA":
                ar_takeout = df["Kode Reseller"].astype(str).str.strip().str.upper().isin(["AR00037", "AR00009", "AR20408"])
                to_drop = zero_jual | ar_takeout | bad_status
                ar37_count = int(ar_takeout.sum())
                one_jual_count = 0
            else:
                one_jual = (df["Hrg. Jual"] == 1)
                to_drop = zero_jual | one_jual | bad_status
                ar37_count = 0
                one_jual_count = int(one_jual.sum())

            clean_count = int((~to_drop).sum())
            takeout_count = int(to_drop.sum())
            zero_jual_count = int(zero_jual.sum())
            bad_status_count = int(bad_status.sum())

            details.append({
                "filename": fname,
                "path": f,
                "size_mb": sz_mb,
                "mtime": mtime_str,
                "total_rows": total_raw,
                "min_date": min_date,
                "max_date": max_date,
                "min_trx_id": min_trx,
                "max_trx_id": max_trx,
                "clean_rows": clean_count,
                "takeout_rows": takeout_count,
                "breakdown": {
                    "zero_jual": zero_jual_count,
                    "one_jual": one_jual_count,
                    "ar00037": ar37_count,
                    "bad_status": bad_status_count
                }
            })
        except Exception as e:
            details.append({
                "filename": fname,
                "path": f,
                "size_mb": sz_mb,
                "mtime": mtime_str,
                "error": str(e)
            })

    return {
        "found": True,
        "count": len(details),
        "files": details
    }


def get_admin_dashboard_data(year: str = "2026") -> dict:
    """
    Mengambil data komprehensif untuk halaman Admin Data.
    """
    import engines.overview_engine as oe
    res = {}
    for brand in ["ASTAGA", "OKIPAY"]:
        watermark = get_current_watermark(brand, year)
        incoming = scan_tsv_incoming(brand, year)
        res[brand] = {
            "watermark": watermark,
            "incoming": incoming
        }
    try:
        res["unmapped"] = oe.check_unmapped_entities(year=year, force=False)
    except Exception as e:
        res["unmapped"] = {}
    return res


def execute_upsert_job(job_id: str, brand: str, delete_tsv: bool = True, year: str = "2026"):
    """
    Menjalankan proses upsert di background thread dengan log bertahap.
    """
    job = ADMIN_JOBS[job_id]
    logs = job["logs"]

    def log(msg):
        t = datetime.now().strftime("%H:%M:%S")
        entry = f"[{t}] {msg}"
        logs.append(entry)
        print(f"[UPSERT {brand}] {msg}")

    try:
        brand = brand.upper()
        log(f"Memulai pipeline upsert untuk {brand} (Tahun {year})...")
        job["progress"] = 5
        job["message"] = f"Memindai file TSV untuk {brand}..."

        subfolder = "ASTAGA" if brand == "ASTAGA" else "OKIPAY"
        folder = os.path.join(RAW_DATA_ROOT, subfolder, year)

        # 1. Cari file TSV
        tsv_files = sorted(glob.glob(os.path.join(folder, "*.tsv")))
        if not tsv_files:
            log(f"Tidak ada file TSV yang ditemukan di {folder}.")
            job["status"] = "error"
            job["message"] = "File TSV tidak ditemukan."
            return

        target_tsv = tsv_files[0]
        log(f"Mendeteksi file incoming: {os.path.basename(target_tsv)} ({os.path.getsize(target_tsv)/1024/1024:.2f} MB)")

        # 2. Baca dan filter TSV
        job["progress"] = 15
        job["message"] = "Membaca & memfilter data TSV sesuai aturan..."
        log("Menerapkan aturan filtering conditional upsert:")
        log("  - Harga jual nol = TAKE OUT")
        if brand == "OKIPAY":
            log("  - Hrg. Jual 1 = TAKE OUT")
        else:
            log("  - AR_ID AR00037, AR00009, AR20408 = TAKE OUT (Internal / H2H)")
        log("  - Status: Saldo Tidak Cukup / Diluar Wilayah / Tujuan Salah = TAKE OUT")

        df = pd.read_csv(target_tsv, sep="\t")
        total_raw = len(df)
        log(f"Total baris mentah dari TSV: {total_raw:,} baris")

        zero_jual = (df["Hrg. Jual"] == 0) | (df["Hrg. Jual"].isna())
        status_lower = df["Status"].astype(str).str.lower().str.strip()
        bad_status = (
            status_lower.str.contains("saldo tidak cukup", na=False) |
            status_lower.str.contains("diluar wilayah", na=False) |
            status_lower.str.contains("tujuan salah", na=False)
        )

        if brand == "ASTAGA":
            ar_takeout = df["Kode Reseller"].astype(str).str.strip().str.upper().isin(["AR00037", "AR00009", "AR20408"])
            to_drop = zero_jual | ar_takeout | bad_status
        else:
            one_jual = (df["Hrg. Jual"] == 1)
            to_drop = zero_jual | one_jual | bad_status

        clean_df = df[~to_drop].copy()
        # Sort ascending agar urutan kronologis dari tanggal terawal ke tanggal terbaru
        if "TrxID" in clean_df.columns:
            clean_df = clean_df.sort_values(by="TrxID", ascending=True).reset_index(drop=True)
        else:
            clean_df = clean_df.reset_index(drop=True)

        clean_df["tgl_entry"] = pd.to_datetime(clean_df["Tgl. Entri"]).dt.to_pydatetime()
        clean_df["tgl_stat"] = pd.to_datetime(clean_df["Tgl. Status"]).dt.to_pydatetime()
        clean_count = len(clean_df)
        log(f"Eliminasi selesai: {int(to_drop.sum()):,} baris di-take out. Data bersih: {clean_count:,} baris.")

        # 3. Cari file Excel target
        job["progress"] = 25
        job["message"] = "Mempersiapkan file Excel target..."
        target_name = "1026.xlsx" if brand == "ASTAGA" else "OP1026.xlsx"
        target_excel = os.path.join(folder, target_name)
        if not os.path.exists(target_excel):
            log(f"Error: File Excel target {target_excel} tidak ditemukan!")
            job["status"] = "error"
            job["message"] = f"File {target_name} tidak ditemukan."
            return

        # 4. Auto Backup
        job["progress"] = 30
        job["message"] = "Membuat backup file Excel..."
        backup_file = target_excel + ".bak"
        shutil.copy2(target_excel, backup_file)
        log(f"Backup berhasil dibuat: {os.path.basename(backup_file)}")

        # 5. Buka Excel & siapkan tabel
        job["progress"] = 40
        job["message"] = "Membuka workbook Excel..."
        log(f"Membuka file Excel {target_name}...")
        wb = openpyxl.load_workbook(target_excel)
        ws = wb["GROSS"]

        # Cek header aktual di Excel untuk mendeteksi apakah kolom formula masih ada
        header_cells = list(next(ws.iter_rows(min_row=1, max_row=1, values_only=True)))
        header_count = sum(1 for c in header_cells if c is not None and str(c).strip())
        has_extra_cols = header_count > 10

        tbl_name = "TB_TRANSAKSI" if brand == "ASTAGA" else "TRANSAKSI"
        tbl = ws.tables.get(tbl_name)

        if has_extra_cols:
            log("Mendeteksi kolom formula tambahan di Excel, formula akan diisi otomatis.")
            if brand == "ASTAGA":
                f_col1 = '=IF(TB_TRANSAKSI[[#This Row],[STATUS]]="Sukses",1/$V$1,"")'
                f_col2 = '=IF(TB_TRANSAKSI[[#This Row],[STATUS]]="Sukses",TB_TRANSAKSI[[#This Row],[JUAL]]/$V$1,"")'
                f_rate = '=IF(TB_TRANSAKSI[[#This Row],[STATUS]]="Sukses",1,0)'
                f_dur  = '=IF(TB_TRANSAKSI[[#This Row],[STATUS]]="Sukses",TB_TRANSAKSI[[#This Row],[TGL.STAT]]-TB_TRANSAKSI[[#This Row],[TGL.ENTRY]],"")'
                f_date = '=INT(TB_TRANSAKSI[[#This Row],[TGL.ENTRY]])'
            else:
                f_col1 = '=IF(TRANSAKSI[[#This Row],[STAT]]="Sukses",1/$T$1,"")'
                f_col2 = '=IF(TRANSAKSI[[#This Row],[STAT]]="Sukses",TRANSAKSI[[#This Row],[HARGA JUAL]]/$T$1,"")'
                f_rate = '=IF(TRANSAKSI[[#This Row],[STAT]]="Sukses",1,0)'
                f_dur  = '=IF(TRANSAKSI[[#This Row],[STAT]]="Sukses",TRANSAKSI[[#This Row],[TGL STAT]]-TRANSAKSI[[#This Row],[TGL ENTRI]],"")'
                f_date = '=INT(TRANSAKSI[[#This Row],[TGL ENTRI]])'
        else:
            log("Format 10 kolom inti terdeteksi (tanpa kolom formula). Proses simpan akan super cepat!")

        # 6. Pemetaan TrxID yang sudah ada untuk logika Upsert
        job["progress"] = 55
        job["message"] = "Mengecek duplikasi & menyusun antrean upsert..."
        log("Mendeteksi ID transaksi eksisting di tabel...")
        
        # Baca kolom 1 (TRX_ID) dari baris 2 s/d max_row
        existing_trx = {}
        for row_idx in range(2, ws.max_row + 1):
            val = ws.cell(row=row_idx, column=1).value
            if val is not None:
                try:
                    existing_trx[int(val)] = row_idx
                except Exception:
                    pass

        log(f"Ditemukan {len(existing_trx):,} transaksi eksisting di Excel.")

        # Eksekusi Insert / Update
        job["progress"] = 65
        job["message"] = "Memproses baris ke lembar kerja Excel..."
        inserted_count = 0
        updated_count = 0

        records = clean_df.to_dict("records")
        for r in records:
            trx_id_val = int(r["TrxID"])
            tgl_entry_val = r["tgl_entry"]
            prod_val = str(r["Produk"])
            qty_val = int(r["Qty"])
            ar_val = str(r["Kode Reseller"])
            modul_val = str(r["Modul"])
            status_val = str(r["Status"])
            tgl_stat_val = r["tgl_stat"]
            beli_val = float(r["Hrg. Beli"])
            jual_val = float(r["Hrg. Jual"])

            if trx_id_val in existing_trx:
                # UPDATE row eksisting (misal update status & tgl stat & harga)
                r_idx = existing_trx[trx_id_val]
                ws.cell(row=r_idx, column=7, value=status_val)        # STATUS / STAT
                ws.cell(row=r_idx, column=8, value=tgl_stat_val)     # TGL.STAT / TGL STAT
                ws.cell(row=r_idx, column=9, value=beli_val)         # BELI / HARGA BELI
                ws.cell(row=r_idx, column=10, value=jual_val)        # JUAL / HARGA JUAL
                updated_count += 1
            else:
                # INSERT baris baru
                if not has_extra_cols:
                    ws.append([
                        trx_id_val, tgl_entry_val, prod_val, qty_val, ar_val,
                        modul_val, status_val, tgl_stat_val, beli_val, jual_val
                    ])
                elif brand == "ASTAGA":
                    ws.append([
                        trx_id_val, tgl_entry_val, prod_val, qty_val, ar_val,
                        modul_val, status_val, tgl_stat_val, beli_val, jual_val,
                        f_col1, f_col2, f_rate, f_dur, f_date,
                        None, None, None, None
                    ])
                else:
                    ws.append([
                        trx_id_val, tgl_entry_val, prod_val, qty_val, ar_val,
                        modul_val, status_val, tgl_stat_val, beli_val, jual_val,
                        f_col1, f_col2, f_rate, f_dur, f_date,
                        None, None
                    ])
                inserted_count += 1

        log(f"Upsert selesai: {inserted_count:,} baris baru di-INSERT, {updated_count:,} baris di-UPDATE.")

        # Perbarui batas tabel
        if tbl:
            from openpyxl.utils import get_column_letter
            max_c = get_column_letter(max(10, header_count))
            tbl.ref = f"A1:{max_c}{ws.max_row}"
            log(f"Rentang {tbl_name} diperbarui menjadi {tbl.ref}.")

        # 7. Simpan File Excel
        job["progress"] = 75
        job["message"] = "Menyimpan file Excel (ini membutuhkan waktu ~1-2 menit)..."
        log("Menyimpan perubahan ke file Excel...")
        wb.save(target_excel)
        wb.close()
        log(f"File {target_name} berhasil disimpan.")

        # 8. Rebuild Cache Parquet
        job["progress"] = 90
        job["message"] = "Sinkronisasi cache Parquet & RAM..."
        log(f"Memicu rebuild cache Parquet transaksi {brand}...")
        cache_res = trx_engine.build_cache(brand, year, force=True)
        log(f"Cache Parquet berhasil disinkronkan: {cache_res.get('rows', 0):,} baris total.")

        # Reload ke memory RAM
        trx_engine.clear_memory_cache(brand, year)
        trx_engine.load(brand, year)
        log("RAM Memory cache berhasil di-refresh.")

        # Refresh cache Analisa Distribusi
        try:
            import engines.analisa_engine as ae
            ae.clear_cache()
            log("Cache Analisa Distribusi berhasil di-refresh.")
        except Exception:
            pass

        # 9. Hapus file TSV jika diminta
        if delete_tsv:
            try:
                os.remove(target_tsv)
                log(f"File TSV {os.path.basename(target_tsv)} berhasil dihapus.")
            except Exception as e:
                log(f"Peringatan: Gagal menghapus file TSV: {e}")

        job["progress"] = 100
        job["status"] = "done"
        job["message"] = "Proses Upsert & Sinkronisasi Selesai Sukses!"
        job["result"] = {
            "brand": brand,
            "tsv_file": os.path.basename(target_tsv),
            "raw_tsv_rows": total_raw,
            "clean_rows": clean_count,
            "inserted_rows": inserted_count,
            "updated_rows": updated_count,
            "total_rows_excel": ws.max_row - 1 if 'ws' in locals() else 0,
            "new_cache_rows": cache_res.get('rows', 0)
        }
        log("Pipeline Upsert selesai 100%!")

    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        log(f"CRITICAL ERROR: {str(e)}")
        print(err_msg)
        job["status"] = "error"
        job["message"] = f"Gagal: {str(e)}"
        job["error_detail"] = err_msg


def start_upsert_job(brand: str, delete_tsv: bool = True, year: str = "2026") -> str:
    """
    Memulai thread background untuk menjalankan upsert. Mengembalikan job_id.
    """
    job_id = str(uuid.uuid4())
    ADMIN_JOBS[job_id] = {
        "job_id": job_id,
        "brand": brand,
        "year": year,
        "status": "running",
        "progress": 0,
        "message": "Inisialisasi...",
        "logs": [],
        "result": None,
        "start_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    t = threading.Thread(
        target=execute_upsert_job,
        args=(job_id, brand, delete_tsv, year),
        daemon=True
    )
    t.start()
    return job_id


def get_job_status(job_id: str) -> dict:
    """
    Mengambil status terkini dari sebuah job.
    """
    return ADMIN_JOBS.get(job_id, {"status": "not_found"})
