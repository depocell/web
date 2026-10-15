"""
overview_engine.py
Menghitung perbandingan performa Daily Transaksi Sukses per Cabang/Channel:
Bulan Berjalan vs Bulan Lalu untuk ASTAGA & OKIPAY, serta Ringkasan Eksekutif
Pilar Digital (OtomaX) dan Pilar Fisik (SISCOM).

Definisi:
  Daily = Total Sukses / Distinct Count Hari Aktif
  Growth (+/-) = Daily Bln Ini - Daily Bln Lalu
  Growth % = ((Daily Bln Ini - Daily Bln Lalu) / Daily Bln Lalu) * 100
"""

import os
import json
import time
import pandas as pd
from typing import Dict, Any, List
import engines.transaction_engine as te
import engines.customer_engine as ce
import engines.metrics_engine as me

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, ".cache")


def _get_fisik_summary() -> Dict[str, Any]:
    """Ekstrak ringkasan penjualan fisik SISCOM (periode aktif terbaru vs sebelumnya)."""
    try:
        import engines.fisik_engine as fe
        periods = fe.get_available_periods()
        if not periods:
            return {}
        latest = periods[0]
        cur_data = fe.load_fisik_data(latest["code"])
        if not cur_data.get("ok"):
            return {}
        rows = cur_data.get("rows", [])
        tot_netto = sum(r.get("netto", 0) for r in rows)
        tot_qty = sum(r.get("qty", 0) for r in rows)

        v_rows = [r for r in rows if r.get("tipe") == "VOUCHER"]
        p_rows = [r for r in rows if r.get("tipe") == "PERDANA"]
        v_qty = sum(r.get("qty", 0) for r in v_rows)
        v_netto = sum(r.get("netto", 0) for r in v_rows)
        p_qty = sum(r.get("qty", 0) for r in p_rows)
        p_netto = sum(r.get("netto", 0) for r in p_rows)

        growth_netto_pct = 0.0
        growth_qty_pct = 0.0
        prev_label = ""
        if len(periods) > 1:
            prev_p = periods[1]
            prev_label = prev_p["label"]
            prev_data = fe.load_fisik_data(prev_p["code"])
            if prev_data.get("ok"):
                prev_rows = prev_data.get("rows", [])
                prev_netto = sum(r.get("netto", 0) for r in prev_rows)
                prev_qty = sum(r.get("qty", 0) for r in prev_rows)
                if prev_netto > 0:
                    growth_netto_pct = round((tot_netto - prev_netto) / prev_netto * 100, 1)
                if prev_qty > 0:
                    growth_qty_pct = round((tot_qty - prev_qty) / prev_qty * 100, 1)

        cab_sums = {}
        for r in rows:
            c = r.get("cabang", "UNKNOWN")
            if c not in cab_sums:
                cab_sums[c] = {"netto": 0, "qty": 0}
            cab_sums[c]["netto"] += r.get("netto", 0)
            cab_sums[c]["qty"] += r.get("qty", 0)

        top_cabangs = sorted(
            [{"cabang": k, "netto": round(v["netto"]), "qty": round(v["qty"])} for k, v in cab_sums.items()],
            key=lambda x: x["netto"],
            reverse=True
        )[:4]

        return {
            "period_code": latest["code"],
            "period_label": latest["label"],
            "prev_label": prev_label,
            "total_netto": round(tot_netto),
            "total_qty": round(tot_qty),
            "growth_netto_pct": growth_netto_pct,
            "growth_qty_pct": growth_qty_pct,
            "voucher_qty": round(v_qty),
            "voucher_netto": round(v_netto),
            "voucher_pct": round(v_qty / tot_qty * 100, 1) if tot_qty > 0 else 0.0,
            "perdana_qty": round(p_qty),
            "perdana_netto": round(p_netto),
            "perdana_pct": round(p_qty / tot_qty * 100, 1) if tot_qty > 0 else 0.0,
            "top_cabangs": top_cabangs
        }
    except Exception as e:
        return {"error": str(e)}


def calculate_daily_growth(year: str = "2026", force: bool = False) -> Dict[str, Any]:
    """
    Menghitung tabel perbandingan Daily Trx Sukses per Cabang untuk ASTAGA dan OKIPAY,
    serta ringkasan eksekutif pilar Digital dan Fisik.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(CACHE_DIR, f"overview_cache_{year}.json")

    import glob
    p_astaga = te._cache_path("ASTAGA", year)
    p_okipay = te._cache_path("OKIPAY", year)
    fisik_files = [f for f in glob.glob(os.path.join(BASE_DIR, "pages", "fisik", "*.*")) if f.endswith((".xls", ".xlsx", ".ttx"))]
    fisik_mtime = max([os.path.getmtime(f) for f in fisik_files]) if fisik_files else 0
    p_mtime = max(
        os.path.getmtime(p_astaga) if os.path.exists(p_astaga) else 0,
        os.path.getmtime(p_okipay) if os.path.exists(p_okipay) else 0,
        fisik_mtime
    )

    if not force and os.path.exists(cache_file) and (p_mtime == 0 or os.path.getmtime(cache_file) >= p_mtime):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cached = json.load(f)
                if "brands" in cached and "ASTAGA" in cached["brands"] and "kpi" in cached:
                    return cached
        except Exception:
            pass

    result: Dict[str, Any] = {
        "year": year,
        "brands": {}
    }

    sum_suk_curr = 0
    sum_all_curr = 0
    all_active_agents = set()
    daily_counts_by_brand = {"ASTAGA": {}, "OKIPAY": {}}

    for brand in ["ASTAGA", "OKIPAY"]:
        df = te.load(brand, year)
        if brand == "ASTAGA":
            df = me.filter_astaga_internal(df)
        cabang_map = ce.get_ar_to_cabang(brand)

        if "is_sukses" not in df.columns:
            df["is_sukses"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False)
        if "ym" not in df.columns:
            df["ym"] = df["tgl_entry"].dt.strftime("%Y-%m")

        df_sukses = df[df["is_sukses"]]

        # Urutkan bulan yang tersedia
        available_months = sorted([str(m) for m in df_sukses["ym"].dropna().unique().tolist() if str(m).startswith(str(year))])
        if len(available_months) >= 2:
            curr_ym = available_months[-1]
            prev_ym = available_months[-2]
        elif len(available_months) == 1:
            curr_ym = available_months[0]
            prev_ym = available_months[0]
        else:
            curr_ym = ""
            prev_ym = ""

        df_curr = df_sukses[df_sukses["ym"] == curr_ym].copy()
        df_prev = df_sukses[df_sukses["ym"] == prev_ym].copy()

        # Statistik gabungan KPI
        df_all_curr_month = df[df["ym"] == curr_ym]
        sum_all_curr += len(df_all_curr_month)
        sum_suk_curr += len(df_curr)
        all_active_agents.update(df_curr["ar_id"].dropna().astype(str).unique().tolist())

        # Hitung denyut harian
        if not df_curr.empty:
            d_grp = df_curr.groupby(df_curr["tgl_entry"].dt.day)["trx_id"].count().to_dict()
            daily_counts_by_brand[brand] = {int(k): int(v) for k, v in d_grp.items()}

        # Map cabang HANYA pada 2 bulan berjalan (10x lebih cepat)
        df_curr["cabang"] = df_curr["ar_id"].astype(str).map(cabang_map).fillna("UNKNOWN")
        df_prev["cabang"] = df_prev["ar_id"].astype(str).map(cabang_map).fillna("UNKNOWN")

        days_curr = me.get_active_days(df_curr)
        days_prev = me.get_active_days(df_prev)

        grp_curr = df_curr.groupby("cabang")["trx_id"].count()
        grp_prev = df_prev.groupby("cabang")["trx_id"].count()

        all_cabangs = sorted(list(set(grp_curr.index).union(set(grp_prev.index))))
        if "UNKNOWN" in all_cabangs:
            all_cabangs.remove("UNKNOWN")
            all_cabangs.append("UNKNOWN")

        rows: List[Dict[str, Any]] = []
        tot_c_count = 0
        tot_p_count = 0

        for c in all_cabangs:
            c_cnt = int(grp_curr.get(c, 0))
            p_cnt = int(grp_prev.get(c, 0))
            tot_c_count += c_cnt
            tot_p_count += p_cnt

            d_curr = me.calculate_daily_rate(c_cnt, days_curr)
            d_prev = me.calculate_daily_rate(p_cnt, days_prev)
            g_info = me.calculate_daily_growth(d_curr, d_prev)

            rows.append({
                "cabang": c,
                "total_curr": c_cnt,
                "total_prev": p_cnt,
                "daily_curr": d_curr,
                "daily_prev": d_prev,
                "growth_val": g_info["growth_diff"],
                "growth_pct": g_info["growth_pct"]
            })

        tot_d_curr = me.calculate_daily_rate(tot_c_count, days_curr)
        tot_d_prev = me.calculate_daily_rate(tot_p_count, days_prev)
        tot_g_info = me.calculate_daily_growth(tot_d_curr, tot_d_prev)

        total_row = {
            "cabang": "TOTAL",
            "total_curr": tot_c_count,
            "total_prev": tot_p_count,
            "daily_curr": tot_d_curr,
            "daily_prev": tot_d_prev,
            "growth_val": tot_g_info["growth_diff"],
            "growth_pct": tot_g_info["growth_pct"]
        }

        result["brands"][brand] = {
            "curr_month": curr_ym,
            "prev_month": prev_ym,
            "days_curr": days_curr,
            "days_prev": days_prev,
            "rows": rows,
            "total": total_row
        }

    # Hitung KPI Gabungan Digital & Performa
    ast_tot = result["brands"].get("ASTAGA", {}).get("total", {})
    oki_tot = result["brands"].get("OKIPAY", {}).get("total", {})

    ast_curr = ast_tot.get("total_curr", 0)
    oki_curr = oki_tot.get("total_curr", 0)
    ast_prev = ast_tot.get("total_prev", 0)
    oki_prev = oki_tot.get("total_prev", 0)

    tot_digital_curr = ast_curr + oki_curr
    tot_digital_prev = ast_prev + oki_prev
    diff_digital = tot_digital_curr - tot_digital_prev
    growth_digital_pct = round(diff_digital / tot_digital_prev * 100, 1) if tot_digital_prev > 0 else 0.0

    daily_digital_curr = round(ast_tot.get("daily_curr", 0) + oki_tot.get("daily_curr", 0), 1)
    daily_digital_prev = round(ast_tot.get("daily_prev", 0) + oki_tot.get("daily_prev", 0), 1)
    g_dig = me.calculate_daily_growth(daily_digital_curr, daily_digital_prev)
    diff_daily = g_dig["growth_diff"]
    growth_daily_pct = g_dig["growth_pct"]
    digital_sukses_rate = round(sum_suk_curr / sum_all_curr * 100, 1) if sum_all_curr > 0 else 0.0

    # Top & Bottom Movers untuk ASTAGA Cabang
    ast_rows = [r for r in result["brands"]["ASTAGA"]["rows"] if r["cabang"] not in ("TOTAL", "UNKNOWN") and r["daily_prev"] > 0]
    top_growth = None
    bottom_growth = None
    if ast_rows:
        top_growth = max(ast_rows, key=lambda x: x["growth_pct"])
        bottom_growth = min(ast_rows, key=lambda x: x["growth_pct"])

    # Trend Harian Gabungan
    all_days = sorted(list(set(daily_counts_by_brand["ASTAGA"].keys()).union(set(daily_counts_by_brand["OKIPAY"].keys()))))
    trend_daily = []
    for day in all_days:
        c_ast = daily_counts_by_brand["ASTAGA"].get(day, 0)
        c_oki = daily_counts_by_brand["OKIPAY"].get(day, 0)
        trend_daily.append({
            "day": day,
            "astaga": c_ast,
            "okipay": c_oki,
            "total": c_ast + c_oki
        })

    result["kpi"] = {
        "digital": {
            "total_curr": tot_digital_curr,
            "total_prev": tot_digital_prev,
            "growth_val": diff_digital,
            "growth_pct": growth_digital_pct,
            "daily_curr": daily_digital_curr,
            "daily_prev": daily_digital_prev,
            "daily_diff": diff_daily,
            "daily_growth_pct": growth_daily_pct,
            "sukses_rate": digital_sukses_rate,
            "active_agents": len(all_active_agents),
            "curr_month": result["brands"]["ASTAGA"]["curr_month"],
            "prev_month": result["brands"]["ASTAGA"]["prev_month"],
            "days_curr": result["brands"]["ASTAGA"]["days_curr"],
            "days_prev": result["brands"]["ASTAGA"]["days_prev"]
        },
        "fisik": _get_fisik_summary()
    }

    result["highlights"] = {
        "top_growth": top_growth,
        "bottom_growth": bottom_growth
    }
    result["trend_daily"] = trend_daily

    # Cek kode reseller & kode produk yang belum ada di master
    result["unmapped"] = check_unmapped_entities(year=year, force=force)

    # Simpan cache
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
    except Exception:
        pass

    return result


_UNMAPPED_CACHE: Dict[str, Any] = {}
_UNMAPPED_TIME: float = 0.0

def clear_unmapped_cache():
    """Mengosongkan in-memory cache audit unmapped saat ada update master."""
    global _UNMAPPED_CACHE, _UNMAPPED_TIME
    _UNMAPPED_CACHE.clear()
    _UNMAPPED_TIME = 0.0

_RAW_NAME_CACHE: Dict[str, Dict[str, str]] = {}

def _get_raw_ar_name(brand: str, ar_code: str) -> str:
    global _RAW_NAME_CACHE
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
    yang belum terdaftar di Master Customer atau Master Produk (di-cache di RAM).
    """
    global _UNMAPPED_CACHE, _UNMAPPED_TIME
    import engines.product_engine as pe

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

        # Produk
        trx_prod = set(df["product_id"].dropna().unique())
        master_prod = set(prod_map.keys())
        missing_prod = sorted(list(trx_prod - master_prod))

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
