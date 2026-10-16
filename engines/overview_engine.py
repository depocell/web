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
