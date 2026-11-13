"""
overview_engine.py
Engine Overview: Menghimpun sari pati (Executive Matrix) dari analisa_engine dan agen_engine
tanpa komputasi ulang Parquet/Database (Zero Re-computation).
"""

import os
from typing import Dict, Any
import engines.analisa_engine as ae
import engines.reseller_engine as re_eng
import engines.daily_engine as de
import engines.metrics_engine as me
import importlib
importlib.reload(re_eng)
importlib.reload(de)

_OVERVIEW_MATRIX_CACHE: Dict[str, Any] = {}


def clear_overview_cache():
    """Hapus cache overview saat data baru di-upsert."""
    global _OVERVIEW_MATRIX_CACHE
    _OVERVIEW_MATRIX_CACHE.clear()
    clear_unmapped_cache()


def get_latest_month_summary(year: str = "2026", force: bool = False) -> Dict[str, Any]:
    """
    Mengagregasi metrik performa operasional & agen bulan berjalan
    untuk disajikan dalam bentuk Executive Comparison Matrix (3 Pilar Bisnis + Konsolidasi):
    1. ASTAGA Reload (Retail & Cabang Fisik: BSD, ICON, PP, PRG, ONLINE)
    2. OKIPAYMENT Retail (Online PlayStore Channel)
    3. OKIPAYMENT H2H (Mitra B2B Host-to-Host: DIGIFLAZZ, Pinasthika, dll)
    4. KONSOLIDASI (Total Server)
    """
    cache_key = f"{year}"
    if not force and cache_key in _OVERVIEW_MATRIX_CACHE:
        return _OVERVIEW_MATRIX_CACHE[cache_key]

    try:
        dataset = ae.get_analisa_dataset()
        astaga_months = sorted([k for k in dataset.get("ASTAGA", {}).keys() if k.startswith(f"{year}-")])
        latest_month = astaga_months[-1].split("-")[1] if astaga_months else "11"
        ym = f"{year}-{latest_month}"

        # 1. Tarik ringkasan Analisa Transaksi (Operasional & SLA)
        astaga_res = ae.query_analisa_data(brand="ASTAGA", year=year, month=latest_month)
        okipay_res = ae.query_analisa_data(brand="OKIPAY", year=year, month=latest_month)

        a_sum = astaga_res.get("summary", {})
        o_sum = okipay_res.get("summary", {})

        a_mod = astaga_res.get("modules_summary", {})
        o_mod = okipay_res.get("modules_summary", {})

        # 2. Tarik metrik Daily Report (termasuk performansi cabang per channel)
        astaga_daily = de.calculate_daily_report(brand="ASTAGA", curr_month=ym, year=year)
        okipay_daily = de.calculate_daily_report(brand="OKIPAY", curr_month=ym, year=year)

        a_avg_daily_mem = float(astaga_daily.get("kpi", {}).get("avg_mem_curr", 0.0))
        a_tpm = round(float(astaga_daily.get("kpi", {}).get("tpm_curr", 0.0)), 2)

        oki_branches = {b["cabang"]: b for b in okipay_daily.get("branches", [])}
        br_online = oki_branches.get("ONLINE", {})
        br_h2h = oki_branches.get("H2H", {})

        # 3. Tarik ringkasan Reseller Downline (#agen?tab=reseller) - Mode Cepat kpi_only
        astaga_reseller = re_eng.calculate_reseller_dashboard(brand="ASTAGA", month_code=ym, year=year, kpi_only=True)
        a_kpi = astaga_reseller.get("kpi", {})

        # OKIPAY Retail (khusus cabang ONLINE) & OKIPAY H2H (khusus cabang H2H)
        oki_res_online = re_eng.calculate_reseller_dashboard(brand="OKIPAY", month_code=ym, year=year, cabang="ONLINE", kpi_only=True)
        o_ret_kpi = oki_res_online.get("kpi", {})

        oki_res_h2h = re_eng.calculate_reseller_dashboard(brand="OKIPAY", month_code=ym, year=year, cabang="H2H", kpi_only=True)
        o_h2h_kpi = oki_res_h2h.get("kpi", {})

        # 4. Hitung Global / Gabungan (Konsolidasi)
        active_days = a_sum.get("active_days") or a_sum.get("total_points") or 26
        month_label = a_sum.get("granularity_label", f"Harian (Bulan {latest_month} {year})")

        # --- PILAR 1: ASTAGA RELOAD (RETAIL & FISIK) ---
        a_daily = a_sum.get("daily_trx_avg", 0)
        a_total = a_sum.get("total_trx", 0)
        a_sukses = a_sum.get("total_sukses", 0)
        a_speed_sec = a_sum.get("avg_dur_sec", 0.0)
        a_speed_str = a_sum.get("avg_dur_str", "00:00")
        a_sukses_pct = a_sum.get("avg_sukses_pct", 0.0)
        a_sukses_str = a_sum.get("avg_sukses_str", "0.0%")
        a_active_cust = a_kpi.get("active_current", 0)
        a_retained = a_kpi.get("retained", 0)
        a_new = a_kpi.get("new_active", 0)
        a_reactivated = a_kpi.get("reactivated", 0)
        a_new_reactivated = a_new + a_reactivated
        a_churn = a_kpi.get("churned", 0)
        a_top_cat = a_sum.get("top_category", "TELCO")
        a_ewallet_pct = a_kpi.get("avg_pct_ewallet", 0.0)
        a_top_branch = a_sum.get("top_branch", "BSD")

        # --- PILAR 2: OKIPAYMENT (RETAIL ONLINE) ---
        o_ret_daily = round(float(br_online.get("daily_curr", 0.0)), 1)
        o_ret_total = int(br_online.get("total_trx", 0))
        o_ret_sukses = int(br_online.get("total_sukses", 0))
        o_ret_speed_sec = float(br_online.get("speed_sec", 15.0))
        o_ret_speed_str = br_online.get("speed_str", "00:15")
        o_ret_speed_status = br_online.get("speed_status", "Prima")
        o_ret_sukses_pct = float(br_online.get("sukses_pct", 0.0))
        o_ret_sukses_str = br_online.get("sukses_str", f"{o_ret_sukses_pct}%")
        o_ret_active_cust = o_ret_kpi.get("active_current", 0)
        o_ret_avg_daily_mem = round(float(br_online.get("daily_mem_curr", 0.0)), 1)
        o_ret_retained = o_ret_kpi.get("retained", 0)
        o_ret_new = o_ret_kpi.get("new_active", 0)
        o_ret_reactivated = o_ret_kpi.get("reactivated", 0)
        o_ret_new_reactivated = o_ret_new + o_ret_reactivated
        o_ret_churn = o_ret_kpi.get("churned", 0)
        o_ret_tpm = round(float(br_online.get("tpm_curr", 0.0)), 2)
        o_ret_top_cat = "TELCO"
        o_ret_ewallet_pct = o_ret_kpi.get("avg_pct_ewallet", 0.0)
        o_ret_top_branch = "ONLINE"

        # --- PILAR 3: OKIPAYMENT (H2H CHANNEL) ---
        o_h2h_daily = round(float(br_h2h.get("daily_curr", 0.0)), 1)
        o_h2h_total = int(br_h2h.get("total_trx", 0))
        o_h2h_sukses = int(br_h2h.get("total_sukses", 0))
        o_h2h_speed_sec = float(br_h2h.get("speed_sec", 20.0))
        o_h2h_speed_str = br_h2h.get("speed_str", "00:20")
        o_h2h_speed_status = br_h2h.get("speed_status", "Prima")
        o_h2h_sukses_pct = float(br_h2h.get("sukses_pct", 0.0))
        o_h2h_sukses_str = br_h2h.get("sukses_str", f"{o_h2h_sukses_pct}%")
        o_h2h_active_cust = o_h2h_kpi.get("active_current", 0)
        o_h2h_avg_daily_mem = round(float(br_h2h.get("daily_mem_curr", 0.0)), 1)
        o_h2h_retained = o_h2h_kpi.get("retained", 0)
        o_h2h_new = o_h2h_kpi.get("new_active", 0)
        o_h2h_reactivated = o_h2h_kpi.get("reactivated", 0)
        o_h2h_new_reactivated = o_h2h_new + o_h2h_reactivated
        o_h2h_churn = o_h2h_kpi.get("churned", 0)
        o_h2h_tpm = round(float(br_h2h.get("tpm_curr", 0.0)), 2)
        o_h2h_top_cat = "TELCO"
        o_h2h_ewallet_pct = o_h2h_kpi.get("avg_pct_ewallet", 0.0)
        o_h2h_top_branch = "H2H"

        # --- PILAR 4: TOTAL KONSOLIDASI (SELURUH SERVER) ---
        tot_daily = round(a_daily + o_ret_daily + o_h2h_daily, 1)
        tot_total = a_total + o_ret_total + o_h2h_total
        tot_sukses = a_sukses + o_ret_sukses + o_h2h_sukses
        tot_sukses_pct = round((tot_sukses / tot_total * 100), 1) if tot_total > 0 else 0.0
        tot_sukses_str = f"{tot_sukses_pct}%"

        # Rata-rata bobot speed tertimbang sukses
        tot_speed_sec = round(((a_speed_sec * a_sukses) + (o_ret_speed_sec * o_ret_sukses) + (o_h2h_speed_sec * o_h2h_sukses)) / tot_sukses, 1) if tot_sukses > 0 else 0.0
        tot_speed_str = me.format_duration_str(tot_speed_sec)

        tot_active_cust = a_active_cust + o_ret_active_cust + o_h2h_active_cust
        tot_avg_daily_mem = round(a_avg_daily_mem + o_ret_avg_daily_mem + o_h2h_avg_daily_mem, 1)
        tot_retained = a_retained + o_ret_retained + o_h2h_retained
        tot_new = a_new + o_ret_new + o_h2h_new
        tot_reactivated = a_reactivated + o_ret_reactivated + o_h2h_reactivated
        tot_new_reactivated = tot_new + tot_reactivated
        tot_churn = a_churn + o_ret_churn + o_h2h_churn
        tot_tpm = round(tot_daily / tot_avg_daily_mem, 2) if tot_avg_daily_mem > 0 else 0.0

        # Porsi total ewallet
        a_ewallet_trx = a_kpi.get("total_ewallet", 0)
        o_ret_ewallet_trx = o_ret_kpi.get("total_ewallet", 0)
        o_h2h_ewallet_trx = o_h2h_kpi.get("total_ewallet", 0)
        tot_ewallet_pct = round(((a_ewallet_trx + o_ret_ewallet_trx + o_h2h_ewallet_trx) / tot_sukses * 100), 1) if tot_sukses > 0 else 0.0

        res_data = {
            "ok": True,
            "year": year,
            "month": latest_month,
            "month_label": month_label,
            "active_days": active_days,
            "astaga": {
                "brand_title": "ASTAGA Reload",
                "brand_tag": "Retail & Cabang Fisik",
                "daily_trx": a_daily,
                "total_trx": a_total,
                "total_sukses": a_sukses,
                "speed_str": a_speed_str,
                "speed_sec": a_speed_sec,
                "speed_status": "Prima" if a_speed_sec < 20 else ("Waspada" if a_speed_sec <= 30 else "Gangguan"),
                "sukses_str": a_sukses_str,
                "sukses_pct": a_sukses_pct,
                "active_cust": a_active_cust,
                "avg_daily_mem": a_avg_daily_mem,
                "retained_cust": a_retained,
                "new_cust": a_new,
                "reactivated_cust": a_reactivated,
                "new_and_reactivated": a_new_reactivated,
                "churn_cust": a_churn,
                "tpm": a_tpm,
                "top_category": a_top_cat,
                "ewallet_pct": a_ewallet_pct,
                "top_branch": a_top_branch,
                "modules_prima": a_mod.get("prima_count", 0),
                "modules_waspada": a_mod.get("waspada_count", 0),
                "modules_gangguan": a_mod.get("gangguan_count", 0)
            },
            "okipay_online": {
                "brand_title": "OKIPAY (RETAIL)",
                "brand_tag": "Online Channel",
                "daily_trx": o_ret_daily,
                "total_trx": o_ret_total,
                "total_sukses": o_ret_sukses,
                "speed_str": o_ret_speed_str,
                "speed_sec": o_ret_speed_sec,
                "speed_status": o_ret_speed_status,
                "sukses_str": o_ret_sukses_str,
                "sukses_pct": o_ret_sukses_pct,
                "active_cust": o_ret_active_cust,
                "avg_daily_mem": o_ret_avg_daily_mem,
                "retained_cust": o_ret_retained,
                "new_cust": o_ret_new,
                "reactivated_cust": o_ret_reactivated,
                "new_and_reactivated": o_ret_new_reactivated,
                "churn_cust": o_ret_churn,
                "tpm": o_ret_tpm,
                "top_category": o_ret_top_cat,
                "ewallet_pct": o_ret_ewallet_pct,
                "top_branch": o_ret_top_branch,
                "modules_prima": o_mod.get("prima_count", 0),
                "modules_waspada": o_mod.get("waspada_count", 0),
                "modules_gangguan": o_mod.get("gangguan_count", 0)
            },
            "okipay_h2h": {
                "brand_title": "OKIPAY (H2H)",
                "brand_tag": "Mitra B2B Server",
                "daily_trx": o_h2h_daily,
                "total_trx": o_h2h_total,
                "total_sukses": o_h2h_sukses,
                "speed_str": o_h2h_speed_str,
                "speed_sec": o_h2h_speed_sec,
                "speed_status": o_h2h_speed_status,
                "sukses_str": o_h2h_sukses_str,
                "sukses_pct": o_h2h_sukses_pct,
                "active_cust": o_h2h_active_cust,
                "avg_daily_mem": o_h2h_avg_daily_mem,
                "retained_cust": o_h2h_retained,
                "new_cust": o_h2h_new,
                "reactivated_cust": o_h2h_reactivated,
                "new_and_reactivated": o_h2h_new_reactivated,
                "churn_cust": o_h2h_churn,
                "tpm": o_h2h_tpm,
                "top_category": o_h2h_top_cat,
                "ewallet_pct": o_h2h_ewallet_pct,
                "top_branch": o_h2h_top_branch,
                "modules_prima": o_mod.get("prima_count", 0),
                "modules_waspada": o_mod.get("waspada_count", 0),
                "modules_gangguan": o_mod.get("gangguan_count", 0)
            },
            "okipay": {
                "brand_title": "OKIPAYMENT",
                "brand_tag": "Online & H2H (Gabungan)",
                "daily_trx": round(o_ret_daily + o_h2h_daily, 1),
                "total_trx": o_ret_total + o_h2h_total,
                "total_sukses": o_ret_sukses + o_h2h_sukses,
                "speed_str": o_sum.get("avg_dur_str", "00:16"),
                "speed_sec": o_sum.get("avg_dur_sec", 16.0),
                "speed_status": "Prima",
                "sukses_str": o_sum.get("avg_sukses_str", "96.5%"),
                "sukses_pct": o_sum.get("avg_sukses_pct", 96.5),
                "active_cust": o_ret_active_cust + o_h2h_active_cust,
                "avg_daily_mem": round(o_ret_avg_daily_mem + o_h2h_avg_daily_mem, 1),
                "retained_cust": o_ret_retained + o_h2h_retained,
                "new_cust": o_ret_new + o_h2h_new,
                "reactivated_cust": o_ret_reactivated + o_h2h_reactivated,
                "new_and_reactivated": o_ret_new_reactivated + o_h2h_new_reactivated,
                "churn_cust": o_ret_churn + o_h2h_churn,
                "tpm": round((o_ret_daily + o_h2h_daily) / (o_ret_avg_daily_mem + o_h2h_avg_daily_mem), 2) if (o_ret_avg_daily_mem + o_h2h_avg_daily_mem) > 0 else 0.0,
                "top_category": "TELCO",
                "ewallet_pct": o_ret_ewallet_pct,
                "top_branch": "H2H",
                "modules_prima": o_mod.get("prima_count", 0),
                "modules_waspada": o_mod.get("waspada_count", 0),
                "modules_gangguan": o_mod.get("gangguan_count", 0)
            },
            "total": {
                "brand_title": "GABUNGAN",
                "brand_tag": "Total Server",
                "daily_trx": tot_daily,
                "total_trx": tot_total,
                "total_sukses": tot_sukses,
                "speed_str": tot_speed_str,
                "speed_sec": tot_speed_sec,
                "speed_status": "Prima" if tot_speed_sec < 20 else "Waspada",
                "sukses_str": tot_sukses_str,
                "sukses_pct": tot_sukses_pct,
                "active_cust": tot_active_cust,
                "avg_daily_mem": tot_avg_daily_mem,
                "retained_cust": tot_retained,
                "new_cust": tot_new,
                "reactivated_cust": tot_reactivated,
                "new_and_reactivated": tot_new_reactivated,
                "churn_cust": tot_churn,
                "tpm": tot_tpm,
                "top_category": a_top_cat,
                "ewallet_pct": tot_ewallet_pct,
                "top_branch": a_top_branch,
                "modules_prima": a_mod.get("prima_count", 0) + o_mod.get("prima_count", 0),
                "modules_waspada": a_mod.get("waspada_count", 0) + o_mod.get("waspada_count", 0),
                "modules_gangguan": a_mod.get("gangguan_count", 0) + o_mod.get("gangguan_count", 0)
            }
        }

        _OVERVIEW_MATRIX_CACHE[cache_key] = res_data
        return res_data

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "ok": False,
            "year": year,
            "error": str(e)
        }


def calculate_daily_growth(year: str = "2026", force: bool = False) -> Dict[str, Any]:
    """Entry point kompatibilitas untuk server.py dan export_static.py"""
    return get_latest_month_summary(year=year, force=force)


_UNMAPPED_CACHE: Dict[str, Any] = {}
_UNMAPPED_TIME: float = 0.0
_RAW_NAME_CACHE: Dict[str, Dict[str, str]] = {}


def _get_raw_ar_name(brand: str, ar_code: str) -> str:
    """Mencari nama toko/reseller dari database atau raw TSV jika tersedia."""
    global _RAW_NAME_CACHE
    import engines.customer_engine as ce
    import sqlite3
    import pandas as pd
    brand = brand.upper()
    if brand not in _RAW_NAME_CACHE:
        _RAW_NAME_CACHE[brand] = {}
        # 1. Coba baca dari master_data.db
        try:
            db_path = os.path.join(ce.MASTER_DIR, "master_data.db")
            if os.path.exists(db_path):
                conn = sqlite3.connect(db_path)
                c = conn.cursor()
                for row in c.execute("SELECT kode_reseller, nama_reseller FROM resellers WHERE brand = ?", (brand,)):
                    if row[0] and row[1]:
                        _RAW_NAME_CACHE[brand][str(row[0]).strip().upper()] = str(row[1]).strip()
                for row in c.execute("SELECT agen_id, nama_agen FROM agents WHERE brand = ?", (brand,)):
                    if row[0] and row[1]:
                        _RAW_NAME_CACHE[brand][str(row[0]).strip().upper()] = str(row[1]).strip()
                conn.close()
        except Exception:
            pass

        # 2. Coba baca dari file TSV OtomaX jika ada
        fname = "astaga.tsv" if brand == "ASTAGA" else "okipay.tsv"
        candidate_paths = [
            os.path.join(ce.MASTER_DIR, fname),
            os.path.join(r"C:\DMS RAW DATA\MASTER", f"RS_{brand}.tsv"),
            os.path.join(r"C:\DMS RAW DATA\UPSERT HARIAN", fname),
        ]
        for p in candidate_paths:
            if os.path.exists(p):
                try:
                    d = pd.read_csv(p, sep="\t", dtype=str)
                    kode_col = next((c for c in d.columns if c.lower() in ("kode", "kode reseller")), None)
                    nama_col = next((c for c in d.columns if c.lower() in ("nama", "nama reseller")), None)
                    if kode_col and nama_col:
                        for _, r in d[[kode_col, nama_col]].dropna().iterrows():
                            k = str(r[kode_col]).strip().upper()
                            if k not in _RAW_NAME_CACHE[brand]:
                                _RAW_NAME_CACHE[brand][k] = str(r[nama_col]).strip()
                except Exception:
                    pass

    return _RAW_NAME_CACHE[brand].get(str(ar_code).strip().upper(), "")


def check_unmapped_entities(year: str = "2026", force: bool = False) -> Dict[str, Any]:
    """
    Mendeteksi kode reseller (ar_id) atau kode produk (product_id) pada transaksi
    yang belum terdaftar di Master Customer atau Master Produk (atau berkategori 'LAINNYA').
    """
    global _UNMAPPED_CACHE, _UNMAPPED_TIME
    import time
    import engines.product_engine as pe
    import engines.customer_engine as ce
    import engines.transaction_engine as te

    now = time.time()
    if not force and year in _UNMAPPED_CACHE and (now - _UNMAPPED_TIME) < 300:
        return _UNMAPPED_CACHE[year]

    unmapped_summary = {}

    for brand in ["ASTAGA", "OKIPAY"]:
        df = te.load(brand, year)
        cust_map = ce.get_ar_to_cabang(brand)
        prod_map = pe.get_product_map(brand)

        # Reseller
        trx_ar = set(df["ar_id"].dropna().astype(str).str.strip().str.upper().unique()) if "ar_id" in df.columns else set()
        master_ar = set(str(k).strip().upper() for k in cust_map.keys())
        missing_ar = sorted(list(trx_ar - master_ar))
        if brand == "ASTAGA":
            missing_ar = [x for x in missing_ar if str(x).strip().upper() not in ("AR00037", "AR00009", "AR20408", "AR02223")]

        # Produk (belum ada di master produk ATAU berkategori 'LAINNYA' / kosong)
        trx_prod = set(df["product_id"].dropna().astype(str).str.strip().str.upper().unique()) if "product_id" in df.columns else set()
        master_prod = set(str(k).strip().upper() for k in prod_map.keys())
        missing_prod = set(trx_prod - master_prod)
        for p in trx_prod.intersection(master_prod):
            info = prod_map.get(p, {})
            k = str(info.get("kategori", "")).strip().upper()
            if not k or k == "LAINNYA":
                missing_prod.add(p)
        missing_prod = sorted(list(missing_prod))

        # Hitung frekuensi secara vektorisasi instan (<0.05s)
        missing_ar_details = []
        if missing_ar and "ar_id" in df.columns:
            ar_vc = df["ar_id"].astype(str).str.strip().str.upper().value_counts()
            for ar_code in missing_ar:
                cnt = int(ar_vc.get(ar_code, 0))
                if cnt > 0:
                    nm = _get_raw_ar_name(brand, ar_code)
                    missing_ar_details.append({
                        "code": str(ar_code),
                        "name": nm,
                        "trx_count": cnt
                    })
            missing_ar_details.sort(key=lambda x: x["trx_count"], reverse=True)

        missing_prod_details = []
        if missing_prod and "product_id" in df.columns:
            prod_vc = df["product_id"].astype(str).str.strip().str.upper().value_counts()
            for p_code in missing_prod:
                cnt = int(prod_vc.get(p_code, 0))
                if cnt > 0:
                    missing_prod_details.append({
                        "code": str(p_code),
                        "trx_count": cnt
                    })
            missing_prod_details.sort(key=lambda x: x["trx_count"], reverse=True)

        unmapped_summary[brand] = {
            "resellers": missing_ar_details,
            "resellers_count": len(missing_ar_details),
            "products": missing_prod_details,
            "products_count": len(missing_prod_details),
        }

    _UNMAPPED_CACHE[year] = unmapped_summary
    _UNMAPPED_TIME = now
    return unmapped_summary


def clear_unmapped_cache():
    """Menghapus cache hasil pengecekan unmapped entities."""
    global _UNMAPPED_CACHE, _UNMAPPED_TIME, _RAW_NAME_CACHE
    _UNMAPPED_CACHE.clear()
    _RAW_NAME_CACHE.clear()
    _UNMAPPED_TIME = 0.0

