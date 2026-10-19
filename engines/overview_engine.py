"""
overview_engine.py
Engine Overview: Mengambil data summary bulan berjalan/terakhir langsung dari analisa_engine
tanpa komputasi rumit.
"""

import os
import json
from typing import Dict, Any
import engines.analisa_engine as ae

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_latest_month_summary(year: str = "2026") -> Dict[str, Any]:
    """
    Meng-clone ringkasan metrik Analisa Distribusi (Daily Trx, Customer Aktif,
    Daily Trx/Member, Top Cabang) bulan terakhir dari analisa_engine.
    """
    try:
        dataset = ae.get_analisa_dataset()
        astaga_months = sorted([k for k in dataset.get("ASTAGA", {}).keys() if k.startswith(f"{year}-")])
        latest_month = astaga_months[-1].split("-")[1] if astaga_months else "10"

        astaga_res = ae.query_analisa_data(brand="ASTAGA", year=year, month=latest_month)
        okipay_res = ae.query_analisa_data(brand="OKIPAY", year=year, month=latest_month)

        astaga_sum = astaga_res.get("summary", {})
        okipay_sum = okipay_res.get("summary", {})

        res_data = {
            "year": year,
            "month": latest_month,
            "month_label": astaga_sum.get("granularity_label", f"Oktober {year}"),
            "brands": {
                "ASTAGA": {
                    "brand_title": "ASTAGA Reload",
                    "brand_tag": "Retail & Cabang Fisik",
                    "daily_trx": astaga_sum.get("daily_trx_avg", 0),
                    "total_trx": astaga_sum.get("total_trx", 0),
                    "total_sukses": astaga_sum.get("total_sukses", 0),
                    "avg_cust": astaga_sum.get("avg_monthly_cust", 0),
                    "avg_tpm": astaga_sum.get("avg_tpm", 0.0),
                    "top_branch": astaga_sum.get("top_branch", "-"),
                    "granularity_label": astaga_sum.get("granularity_label", "")
                },
                "OKIPAY": {
                    "brand_title": "OKIPAYMENT",
                    "brand_tag": "Online & H2H",
                    "daily_trx": okipay_sum.get("daily_trx_avg", 0),
                    "total_trx": okipay_sum.get("total_trx", 0),
                    "total_sukses": okipay_sum.get("total_sukses", 0),
                    "avg_cust": okipay_sum.get("avg_monthly_cust", 0),
                    "avg_tpm": okipay_sum.get("avg_tpm", 0.0),
                    "top_branch": okipay_sum.get("top_branch", "-"),
                    "granularity_label": okipay_sum.get("granularity_label", "")
                }
            }
        }

        # Simpan snapshot lokal agar selalu terlayani instan
        try:
            snap_path = os.path.join(BASE_DIR, "pages", "home", "overview_data.json")
            with open(snap_path, "w", encoding="utf-8") as f:
                json.dump({"ok": True, "data": res_data}, f, indent=2)
        except Exception:
            pass

        return res_data
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "year": year,
            "error": str(e),
            "brands": {}
        }


def calculate_daily_growth(year: str = "2026", force: bool = False) -> Dict[str, Any]:
    """Entry point kompatibilitas untuk server.py dan export_static.py"""
    return get_latest_month_summary(year=year)


_UNMAPPED_CACHE: Dict[str, Any] = {}
_UNMAPPED_TIME: float = 0.0
_RAW_NAME_CACHE: Dict[str, Dict[str, str]] = {}


def _get_raw_ar_name(brand: str, ar_code: str) -> str:
    global _RAW_NAME_CACHE
    import engines.customer_engine as ce
    import pandas as pd
    if brand not in _RAW_NAME_CACHE:
        try:
            fname = "astaga.tsv" if brand == "ASTAGA" else "okipay.tsv"
            p = os.path.join(ce.MASTER_DIR, fname)
            if os.path.exists(p):
                d = pd.read_csv(p, sep="\t", usecols=["Kode", "Nama"], dtype=str)
                _RAW_NAME_CACHE[brand] = dict(zip(d["Kode"].str.strip().str.upper(), d["Nama"].str.strip()))
            else:
                _RAW_NAME_CACHE[brand] = {}
        except Exception:
            _RAW_NAME_CACHE[brand] = {}
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
        trx_ar = set(df["ar_id"].dropna().unique())
        master_ar = set(cust_map.keys())
        missing_ar = sorted(list(trx_ar - master_ar))
        if brand == "ASTAGA":
            missing_ar = [x for x in missing_ar if str(x).strip().upper() not in ("AR00037", "AR00009", "AR20408", "AR02223")]

        # Produk (belum ada di master produk ATAU berkategori 'LAINNYA' / kosong)
        trx_prod = set(df["product_id"].dropna().unique())
        master_prod = set(prod_map.keys())
        missing_prod = set(trx_prod - master_prod)
        for p in trx_prod.intersection(master_prod):
            info = prod_map.get(p, {})
            k = str(info.get("kategori", "")).strip().upper()
            if not k or k == "LAINNYA":
                missing_prod.add(p)
        missing_prod = sorted(list(missing_prod))

        # Hitung frekuensi secara vektorisasi instan (<0.05s)
        missing_ar_details = []
        if missing_ar:
            ar_vc = df["ar_id"].value_counts()
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
        if missing_prod:
            prod_vc = df["product_id"].value_counts()
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
    global _UNMAPPED_CACHE, _UNMAPPED_TIME
    _UNMAPPED_CACHE.clear()
    _UNMAPPED_TIME = 0.0
