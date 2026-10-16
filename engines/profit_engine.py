"""
engines/profit_engine.py
========================
Engine Analisa Revenue, Modal (HPP), Markup Komisi Upline, dan Net Profit Murni Server.
Sesuai Ketentuan GEMINI.md:
1. Gross Revenue = Total Harga Jual (kotor)
2. Total Modal = Total Harga Beli
3. Gross Profit = Gross Revenue - Total Modal
4. Komisi Upline = Total Markup Reseller Downline (bukan laba server!)
5. Net Profit Server = (Gross Revenue - Komisi Upline) - Total Modal
6. Yield per Trx = Net Profit Server / Total Trx Sukses
7. Run-rate Harian = Nominal / Active Cut-off Days
8. Filter Akun Internal ASTAGA: AR00037 dan AR00009 WAJIB di-exclude
"""

import os
import sqlite3
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional
import engines.transaction_engine as te
import engines.product_engine as pe
import engines.reseller_engine as re
import engines.metrics_engine as me

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "MASTER", "master_data.db")

_PROFIT_CACHE: Dict[tuple, Dict[str, Any]] = {}
_MARKUP_CACHE: Dict[str, Dict[str, float]] = {}


def get_reseller_markup_map(brand: str) -> Dict[str, float]:
    """Mengambil pemetaan markup per kode reseller dari master_data.db (cached)."""
    brand_upper = brand.upper()
    if brand_upper in _MARKUP_CACHE:
        return _MARKUP_CACHE[brand_upper]

    markup_map = {}
    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("SELECT kode_reseller, markup FROM resellers WHERE brand = ?", (brand_upper,))
            for rid, mk in cur.fetchall():
                if rid:
                    markup_map[str(rid).strip().upper()] = float(mk or 0.0)
            conn.close()
        except Exception as e:
            print(f"[WARN] Gagal membaca markup resellers dari SQLite: {e}")

    _MARKUP_CACHE[brand_upper] = markup_map
    return markup_map


def clear_profit_cache():
    """Bersihkan cache analisa profit."""
    global _PROFIT_CACHE, _MARKUP_CACHE
    _PROFIT_CACHE.clear()
    _MARKUP_CACHE.clear()


def calculate_profit_analysis(
    brand: str = "ASTAGA",
    year: str = "2026",
    month_code: Optional[str] = None
) -> Dict[str, Any]:
    """
    Menghitung analisa menyeluruh Revenue, Modal, Komisi Upline, dan Net Profit Server.
    Mendukung ASTAGA, OKIPAY, dan ALL (GABUNGAN).
    """
    brand_upper = brand.upper()
    cache_key = (brand_upper, str(year), str(month_code or "ALL"))
    if cache_key in _PROFIT_CACHE:
        return _PROFIT_CACHE[cache_key]

    target_brands = ["ASTAGA", "OKIPAY"] if brand_upper in ("ALL", "GABUNGAN") else [brand_upper]
    frames = []
    combined_prod_map = {}

    reseller_meta, _ = re.load_master_meta()

    for b in target_brands:
        try:
            df_b = te.load(b, str(year))
        except Exception:
            continue
        if df_b is None or df_b.empty:
            continue

        # Filter akun internal jika ASTAGA
        if b == "ASTAGA":
            df_b = me.filter_astaga_internal(df_b)

        # Filter status SUKSES saja
        if "is_sukses" not in df_b.columns and "status" in df_b.columns:
            df_b["is_sukses"] = df_b["status"].astype(str).str.lower().str.contains("sukses", na=False)
        df_b_sukses = df_b[df_b["is_sukses"]].copy()

        if df_b_sukses.empty:
            continue

        if "ym" not in df_b_sukses.columns:
            df_b_sukses["ym"] = df_b_sukses["tgl_entry"].dt.strftime("%Y-%m")

        markup_map = get_reseller_markup_map(b)
        prod_map = pe.get_product_map(b)
        combined_prod_map.update(prod_map)

        # Hitung markup per transaksi
        ar_series = df_b_sukses["ar_id"].astype(str).str.strip().str.upper()
        df_b_sukses["markup"] = ar_series.map(markup_map).fillna(0.0)

        # Hitung finansial
        df_b_sukses["gross_profit"] = df_b_sukses["jual"] - df_b_sukses["beli"]
        df_b_sukses["net_profit"] = me.calculate_net_profit(df_b_sukses["jual"], df_b_sukses["beli"], df_b_sukses["markup"])

        # Mapping kategori produk (fast dict lookup)
        def map_category_val(pid):
            p_upper = str(pid).strip().upper()
            info = prod_map.get(p_upper)
            if info and info.get("kategori"):
                k = info["kategori"].strip().upper()
                if "EWALLET" in k: return "EWALLET"
                if "PPOB" in k: return "PPOB"
                if "TELCO" in k: return "TELCO"
                if "PLN" in k: return "TOKEN PLN"
                if "TRANSFER" in k: return "TRANSFER STOK"
                if "GAME" in k: return "VOUCHER GAME"
                return k
            return "LAINNYA"

        unique_pids = df_b_sukses["product_id"].dropna().unique()
        cat_lookup = {pid: map_category_val(pid) for pid in unique_pids}
        df_b_sukses["category"] = df_b_sukses["product_id"].map(cat_lookup).fillna("LAINNYA")
        df_b_sukses["brand_src"] = b

        frames.append(df_b_sukses)

    if not frames:
        return {"ok": False, "error": f"Tidak ada transaksi sukses untuk brand {brand_upper} {year}"}

    df_sukses = pd.concat(frames, ignore_index=True) if len(frames) > 1 else frames[0]
    available_months = sorted([str(m) for m in df_sukses["ym"].dropna().unique().tolist() if str(m).startswith(str(year))])

    # 1. TREN BULANAN (MONTHLY BREAKDOWN) - Vectorized Aggregation
    monthly_trend = []
    month_agg = df_sukses.groupby("ym", as_index=False).agg(
        total_trx=("jual", "count"),
        gross_revenue=("jual", "sum"),
        total_modal=("beli", "sum"),
        gross_profit=("gross_profit", "sum"),
        komisi_upline=("markup", "sum"),
        net_profit=("net_profit", "sum"),
        days_active=("tgl_entry", lambda s: s.dt.day.nunique())
    )
    month_agg_dict = {row["ym"]: row for _, row in month_agg.iterrows()}

    for ym in available_months:
        row_agg = month_agg_dict.get(ym)
        if row_agg is None:
            continue

        m_tot_trx = int(row_agg["total_trx"])
        m_rev = float(row_agg["gross_revenue"])
        m_mod = float(row_agg["total_modal"])
        m_gp = float(row_agg["gross_profit"])
        m_mk = float(row_agg["komisi_upline"])
        m_np = float(row_agg["net_profit"])
        m_days = max(1, int(row_agg["days_active"]))

        monthly_trend.append({
            "ym": ym,
            "month_label": ym.split("-")[1],
            "total_trx": m_tot_trx,
            "gross_revenue": round(m_rev, 0),
            "total_modal": round(m_mod, 0),
            "gross_profit": round(m_gp, 0),
            "komisi_upline": round(m_mk, 0),
            "net_profit": round(m_np, 0),
            "margin_net_pct": round((m_np / m_rev * 100), 2) if m_rev > 0 else 0.0,
            "margin_gross_pct": round((m_gp / m_rev * 100), 2) if m_rev > 0 else 0.0,
            "yield_per_trx": round(m_np / m_tot_trx, 2) if m_tot_trx > 0 else 0.0,
            "days_active": m_days,
            "daily_trx": me.calculate_daily_rate(m_tot_trx, m_days),
            "daily_revenue": me.calculate_daily_rate(m_rev, m_days),
            "daily_net_profit": me.calculate_daily_rate(m_np, m_days)
        })

    # Normalisasi format month_code (misal "11" -> "2026-11", atau "2026-11")
    norm_month = None
    if month_code and str(month_code).strip().upper() not in ("ALL", "", "NONE"):
        m_str = str(month_code).strip()
        if m_str.isdigit() and len(m_str) <= 2:
            norm_month = f"{year}-{m_str.zfill(2)}"
        else:
            norm_month = m_str

    # Jika spesifik bulan dipilih (atau default ALL)
    if norm_month:
        if norm_month in available_months:
            df_target = df_sukses[df_sukses["ym"] == norm_month]
            selected_period_label = norm_month
        else:
            # Spesifik bulan dipilih tapi belum ada transaksi (misal Nov/Des 2026) -> Nol Data
            df_target = df_sukses.iloc[0:0]
            selected_period_label = f"{norm_month} (Nol Data)"
    else:
        df_target = df_sukses
        selected_period_label = f"Tahun {year} (Semua Bulan)"

    tot_trx = len(df_target)
    tot_rev = float(df_target["jual"].sum()) if not df_target.empty else 0.0
    tot_mod = float(df_target["beli"].sum()) if not df_target.empty else 0.0
    tot_gp = float(df_target["gross_profit"].sum()) if not df_target.empty else 0.0
    tot_mk = float(df_target["markup"].sum()) if not df_target.empty else 0.0
    tot_np = float(df_target["net_profit"].sum()) if not df_target.empty else 0.0
    days_act = int(df_target["tgl_entry"].dt.day.nunique()) if not df_target.empty else 0

    # 2. BREAKDOWN PER KATEGORI PRODUK - Vectorized
    cat_summary = []
    cat_agg = df_target.groupby("category", as_index=False).agg(
        total_trx=("jual", "count"),
        gross_revenue=("jual", "sum"),
        total_modal=("beli", "sum"),
        gross_profit=("gross_profit", "sum"),
        komisi_upline=("markup", "sum"),
        net_profit=("net_profit", "sum"),
    )
    for _, r in cat_agg.iterrows():
        c_trx = int(r["total_trx"])
        c_rev = float(r["gross_revenue"])
        c_mod = float(r["total_modal"])
        c_gp = float(r["gross_profit"])
        c_mk = float(r["komisi_upline"])
        c_np = float(r["net_profit"])

        cat_summary.append({
            "category": str(r["category"]),
            "total_trx": c_trx,
            "pct_trx": round(c_trx / tot_trx * 100, 1) if tot_trx > 0 else 0.0,
            "gross_revenue": round(c_rev, 0),
            "pct_revenue": round(c_rev / tot_rev * 100, 1) if tot_rev > 0 else 0.0,
            "total_modal": round(c_mod, 0),
            "gross_profit": round(c_gp, 0),
            "komisi_upline": round(c_mk, 0),
            "net_profit": round(c_np, 0),
            "pct_profit": round(c_np / tot_np * 100, 1) if tot_np > 0 else 0.0,
            "margin_net_pct": round(c_np / c_rev * 100, 2) if c_rev > 0 else 0.0,
            "yield_per_trx": round(c_np / c_trx, 2) if c_trx > 0 else 0.0
        })
    cat_summary.sort(key=lambda x: x["net_profit"], reverse=True)

    # 3. TOP 10 PRODUK KONTRIBUTOR NET PROFIT TERTINGGI - Vectorized
    prod_agg = df_target.groupby("product_id", as_index=False).agg(
        total_trx=("jual", "count"),
        gross_revenue=("jual", "sum"),
        komisi_upline=("markup", "sum"),
        net_profit=("net_profit", "sum"),
        category=("category", "first")
    )
    prod_agg = prod_agg[prod_agg["total_trx"] >= 5].sort_values("net_profit", ascending=False).head(10)
    top_10_products = []
    for _, r in prod_agg.iterrows():
        pid = str(r["product_id"])
        p_trx = int(r["total_trx"])
        p_rev = float(r["gross_revenue"])
        p_mk = float(r["komisi_upline"])
        p_np = float(r["net_profit"])
        p_info = combined_prod_map.get(pid.upper(), {})
        p_name = p_info.get("nama") or p_info.get("product_name") or pid

        top_10_products.append({
            "product_id": pid,
            "product_name": p_name,
            "kategori": str(r["category"]),
            "total_trx": p_trx,
            "gross_revenue": round(p_rev, 0),
            "komisi_upline": round(p_mk, 0),
            "net_profit": round(p_np, 0),
            "yield_per_trx": round(p_np / p_trx, 2) if p_trx > 0 else 0.0
        })

    # 4. TOP 10 RESELLER KONTRIBUTOR NET PROFIT SERVER TERTINGGI - Vectorized
    res_agg = df_target.groupby("ar_id", as_index=False).agg(
        total_trx=("jual", "count"),
        gross_revenue=("jual", "sum"),
        komisi_upline=("markup", "sum"),
        net_profit=("net_profit", "sum")
    ).sort_values("net_profit", ascending=False).head(10)

    top_10_resellers = []
    for _, r in res_agg.iterrows():
        rid = str(r["ar_id"])
        r_trx = int(r["total_trx"])
        r_rev = float(r["gross_revenue"])
        r_mk = float(r["komisi_upline"])
        r_np = float(r["net_profit"])
        rmeta = reseller_meta.get(rid, {})
        r_name = rmeta.get("name", rid)
        r_cabang = rmeta.get("cabang", "-")

        top_10_resellers.append({
            "kode_reseller": rid,
            "nama_reseller": r_name,
            "cabang": r_cabang,
            "total_trx": r_trx,
            "gross_revenue": round(r_rev, 0),
            "komisi_upline": round(r_mk, 0),
            "net_profit": round(r_np, 0),
            "yield_per_trx": round(r_np / r_trx, 2) if r_trx > 0 else 0.0
        })

    result = {
        "ok": True,
        "brand": brand_upper,
        "year": str(year),
        "selected_month": norm_month or "ALL",
        "selected_period_label": selected_period_label,
        "available_months": available_months,
        "kpi": {
            "total_trx": tot_trx,
            "days_active": days_act,
            "gross_revenue": round(tot_rev, 0),
            "total_modal": round(tot_mod, 0),
            "gross_profit": round(tot_gp, 0),
            "komisi_upline": round(tot_mk, 0),
            "net_profit": round(tot_np, 0),
            "margin_net_pct": round((tot_np / tot_rev * 100), 2) if tot_rev > 0 else 0.0,
            "margin_gross_pct": round((tot_gp / tot_rev * 100), 2) if tot_rev > 0 else 0.0,
            "yield_per_trx": round(tot_np / tot_trx, 2) if tot_trx > 0 else 0.0,
            "daily_trx": me.calculate_daily_rate(tot_trx, days_act),
            "daily_revenue": me.calculate_daily_rate(tot_rev, days_act),
            "daily_net_profit": me.calculate_daily_rate(tot_np, days_act)
        },
        "monthly_trend": monthly_trend,
        "category_breakdown": cat_summary,
        "top_products": top_10_products,
        "top_resellers": top_10_resellers
    }

    _PROFIT_CACHE[cache_key] = result
    return result
