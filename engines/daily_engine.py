"""
daily_engine.py
Komputasi Daily Summary Report (Executive Single Page):
- 4 KPI Cards: AVG DAILY TRX, AVG DAILY MEMBER, DAILY TRX / MEMBER (TPM), %SUKSES & SPEED
- Grafik Tren Harian (Bar Transaksi + Line Member Aktif)
- Performansi Cabang (Hierarki Channel resmi dengan delta vs BL)
- Performansi Produk (Hierarki TELCO + Operator, EWALLET, PPOB, TOKEN PLN, TRANSFER STOK, VOUCHER GAME)
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List
import engines.transaction_engine as te
import engines.customer_engine as ce
import engines.product_engine as pe
import engines.metrics_engine as me
import engines.profit_engine as profit_engine

BRAND_CONFIG = {
    "ASTAGA": {
        "name": "My Astaga!",
        "channels": ["BSD", "ICON", "ONLINE", "PP", "PRG"],
        "categories": ["TELCO", "EWALLET", "PPOB", "TOKEN PLN", "TRANSFER STOK", "VOUCHER GAME"],
        "telco_operators": ["INDOSAT", "XL - AXIS", "TRI", "TELKOMSEL", "SMARTFREN"]
    },
    "OKIPAY": {
        "name": "OKI PAY",
        "channels": ["ONLINE", "H2H"],
        "categories": ["TELCO", "EWALLET", "TOKEN PLN", "PPOB", "VOUCHER GAME"],
        "telco_operators": ["XL - AXIS", "TELKOMSEL", "INDOSAT", "TRI", "SMARTFREN"]
    }
}

def _format_duration(seconds: float) -> str:
    return me.format_duration_str(seconds)

def get_available_periods(brand: str = "ASTAGA", year: str = "2026") -> List[Dict[str, str]]:
    """Daftar pasangan periode [Bulan Ini, Bulan Lalu] yang tersedia."""
    try:
        df = te.load(brand, year)
        if "ym" not in df.columns:
            df["ym"] = df["tgl_entry"].dt.strftime("%Y-%m")
        months = sorted([str(m) for m in df["ym"].dropna().unique().tolist() if str(m).startswith(str(year))], reverse=True)
        periods = []
        for i in range(len(months)):
            curr = months[i]
            prev = months[i + 1] if i + 1 < len(months) else months[i]
            periods.append({
                "curr": curr,
                "prev": prev,
                "label": f"{curr} (vs {prev})"
            })
        return periods
    except Exception:
        return []

_DAILY_REPORT_CACHE = {}

def clear_daily_cache():
    global _DAILY_REPORT_CACHE
    _DAILY_REPORT_CACHE.clear()

def calculate_daily_report(brand: str = "ASTAGA", curr_month: str = None, prev_month: str = None, year: str = "2026") -> Dict[str, Any]:
    """Kalkulasi lengkap untuk Daily Summary Report."""
    global _DAILY_REPORT_CACHE
    brand = brand.upper()
    cache_key = (brand, str(curr_month or ""), str(prev_month or ""), str(year))
    if cache_key in _DAILY_REPORT_CACHE:
        return _DAILY_REPORT_CACHE[cache_key]

    cfg = BRAND_CONFIG.get(brand, BRAND_CONFIG["ASTAGA"])
    
    df = te.load(brand, year)
    if brand.upper() == "ASTAGA":
        df = me.filter_astaga_internal(df)
    cabang_map = ce.get_ar_to_cabang(brand)
    prod_map = pe.get_product_map(brand)

    # Siapkan kolom kalkulasi yang di-cache di memori
    if "ym" not in df.columns:
        df["ym"] = df["tgl_entry"].dt.strftime("%Y-%m")
    if "is_sukses" not in df.columns:
        df["is_sukses"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False)

    # Tentukan periode
    months = sorted([str(m) for m in df["ym"].dropna().unique().tolist() if str(m).startswith(str(year))])
    if not curr_month:
        curr_month = months[-1] if months else f"{year}-10"
    if not prev_month:
        if curr_month in months:
            idx = months.index(curr_month)
            prev_month = months[idx - 1] if idx > 0 else curr_month
        else:
            prev_month = months[-2] if len(months) >= 2 else curr_month

    df_curr_all = df[df["ym"] == curr_month].copy()
    df_prev_all = df[df["ym"] == prev_month].copy()

    # Hanya hitung tanggal dan durasi pada 2 bulan yang relevan (10x lebih cepat)
    df_curr_all["date"] = df_curr_all["tgl_entry"].dt.date
    df_prev_all["date"] = df_prev_all["tgl_entry"].dt.date

    dur_curr = (df_curr_all["tgl_stat"] - df_curr_all["tgl_entry"]).dt.total_seconds()
    df_curr_all["durasi_sec"] = dur_curr.where((dur_curr >= 0) & (dur_curr <= 86400), np.nan)

    dur_prev = (df_prev_all["tgl_stat"] - df_prev_all["tgl_entry"]).dt.total_seconds()
    df_prev_all["durasi_sec"] = dur_prev.where((dur_prev >= 0) & (dur_prev <= 86400), np.nan)

    # Hitung markup dan base_price (Harga Jual Dasar) sesuai Hukum 2 GEMINI.md
    markup_map = profit_engine.get_reseller_markup_map(brand)
    for df_slice in (df_curr_all, df_prev_all):
        ar_sub = df_slice["ar_id"].astype(str).str.strip().str.upper()
        df_slice["markup"] = ar_sub.map(markup_map).fillna(0.0)
        df_slice["base_price"] = me.calculate_server_base_price(df_slice["jual"].fillna(0.0), df_slice["markup"])

    df_curr_sukses = df_curr_all[df_curr_all["is_sukses"]].copy()
    df_prev_sukses = df_prev_all[df_prev_all["is_sukses"]].copy()

    days_curr = me.get_active_days(df_curr_all, date_col="tgl_entry")
    days_prev = me.get_active_days(df_prev_all, date_col="tgl_entry")

    # 1. KPI CARDS
    tot_trx_curr = int(len(df_curr_sukses))
    tot_trx_prev = int(len(df_prev_sukses))
    avg_trx_curr = me.calculate_daily_rate(tot_trx_curr, days_curr)
    avg_trx_prev = me.calculate_daily_rate(tot_trx_prev, days_prev)
    growth_trx = me.calculate_daily_growth(avg_trx_curr, avg_trx_prev)
    diff_trx = growth_trx["growth_diff"]
    growth_trx_pct = growth_trx["growth_pct"]

    mem_per_day_curr = df_curr_sukses.groupby("date")["ar_id"].nunique()
    mem_per_day_prev = df_prev_sukses.groupby("date")["ar_id"].nunique()
    avg_mem_curr = float(mem_per_day_curr.mean()) if not mem_per_day_curr.empty else 0.0
    avg_mem_prev = float(mem_per_day_prev.mean()) if not mem_per_day_prev.empty else 0.0
    diff_mem = float(avg_mem_curr - avg_mem_prev)
    growth_mem_pct = float(diff_mem / avg_mem_prev * 100) if avg_mem_prev > 0 else 0.0

    tpm_curr = float(avg_trx_curr / avg_mem_curr) if avg_mem_curr > 0 else 0.0
    tpm_prev = float(avg_trx_prev / avg_mem_prev) if avg_mem_prev > 0 else 0.0
    diff_tpm = float(tpm_curr - tpm_prev)
    growth_tpm_pct = float(diff_tpm / tpm_prev * 100) if tpm_prev > 0 else 0.0

    sukses_pct_curr = float(tot_trx_curr / len(df_curr_all) * 100) if len(df_curr_all) > 0 else 0.0
    sukses_pct_prev = float(tot_trx_prev / len(df_prev_all) * 100) if len(df_prev_all) > 0 else 0.0
    diff_sukses = float(sukses_pct_curr - sukses_pct_prev)

    avg_dur_curr = float(df_curr_sukses["durasi_sec"].mean()) if not df_curr_sukses.empty else 0.0
    avg_dur_prev = float(df_prev_sukses["durasi_sec"].mean()) if not df_prev_sukses.empty else 0.0

    kpi = {
        "avg_trx_curr": round(avg_trx_curr, 1),
        "avg_trx_prev": round(avg_trx_prev, 1),
        "diff_trx": round(diff_trx, 1),
        "growth_trx_pct": round(growth_trx_pct, 2),
        "total_mtd_trx": tot_trx_curr,

        "avg_mem_curr": round(avg_mem_curr, 1),
        "avg_mem_prev": round(avg_mem_prev, 1),
        "diff_mem": round(diff_mem, 1),
        "growth_mem_pct": round(growth_mem_pct, 2),

        "tpm_curr": round(tpm_curr, 2),
        "tpm_prev": round(tpm_prev, 2),
        "diff_tpm": round(diff_tpm, 2),
        "growth_tpm_pct": round(growth_tpm_pct, 2),

        "sukses_pct_curr": round(sukses_pct_curr, 2),
        "sukses_pct_prev": round(sukses_pct_prev, 2),
        "diff_sukses": round(diff_sukses, 2),
        "avg_dur_curr_str": _format_duration(avg_dur_curr),
        "avg_dur_prev_str": _format_duration(avg_dur_prev),
    }

    # 2. GRAFIK TREN HARIAN
    daily_groups_trx = df_curr_sukses.groupby("date")["trx_id"].count()
    daily_groups_mem = df_curr_sukses.groupby("date")["ar_id"].nunique()
    
    daily_chart = []
    for d, trx_cnt in daily_groups_trx.items():
        daily_chart.append({
            "date": str(d),
            "day": int(d.day),
            "label": d.strftime("%d/%m"),
            "trx": int(trx_cnt),
            "member": int(daily_groups_mem.get(d, 0))
        })
    daily_chart.sort(key=lambda x: x["day"])

    # 3. PERFORMANSI CABANG
    df_curr_sukses["cabang"] = df_curr_sukses["ar_id"].astype(str).map(cabang_map).fillna("UNKNOWN")
    df_prev_sukses["cabang"] = df_prev_sukses["ar_id"].astype(str).map(cabang_map).fillna("UNKNOWN")

    channels = cfg["channels"]
    branches = []
    tot_branch_curr_trx = 0.0
    tot_branch_prev_trx = 0.0
    tot_branch_curr_mem = 0.0
    tot_branch_prev_mem = 0.0

    max_cab_trx = 1.0

    for ch in channels:
        c_ch = df_curr_sukses[df_curr_sukses["cabang"] == ch]
        p_ch = df_prev_sukses[df_prev_sukses["cabang"] == ch]

        d_trx_c = me.calculate_daily_rate(len(c_ch), days_curr)
        d_trx_p = me.calculate_daily_rate(len(p_ch), days_prev)
        diff_c_trx = me.calculate_daily_growth(d_trx_c, d_trx_p)["growth_diff"]

        d_mem_c = round(float(c_ch.groupby("date")["ar_id"].nunique().mean()), 1) if not c_ch.empty else 0.0
        d_mem_p = round(float(p_ch.groupby("date")["ar_id"].nunique().mean()), 1) if not p_ch.empty else 0.0
        diff_c_mem = round(d_mem_c - d_mem_p, 1)

        tpm_c = round(float(d_trx_c / d_mem_c), 2) if d_mem_c > 0 else 0.0
        tpm_p = round(float(d_trx_p / d_mem_p), 2) if d_mem_p > 0 else 0.0
        diff_c_tpm = round(tpm_c - tpm_p, 2)

        tot_branch_curr_trx += d_trx_c
        tot_branch_prev_trx += d_trx_p
        tot_branch_curr_mem += d_mem_c
        tot_branch_prev_mem += d_mem_p

        if d_trx_c > max_cab_trx:
            max_cab_trx = d_trx_c

        branches.append({
            "cabang": ch,
            "daily_curr": d_trx_c,
            "daily_prev": d_trx_p,
            "diff_trx": diff_c_trx,
            "daily_mem_curr": d_mem_c,
            "daily_mem_prev": d_mem_p,
            "diff_mem": diff_c_mem,
            "tpm_curr": tpm_c,
            "tpm_prev": tpm_p,
            "diff_tpm": diff_c_tpm,
        })

    # Hitung share_pct & bar_pct
    for b in branches:
        b["share_pct"] = round(float(b["daily_curr"] / tot_branch_curr_trx * 100), 1) if tot_branch_curr_trx > 0 else 0.0
        b["bar_pct"] = round(float(b["daily_curr"] / max_cab_trx * 100), 1)

    tot_tpm_c = round(float(tot_branch_curr_trx / tot_branch_curr_mem), 2) if tot_branch_curr_mem > 0 else 0.0
    tot_tpm_p = round(float(tot_branch_prev_trx / tot_branch_prev_mem), 2) if tot_branch_prev_mem > 0 else 0.0

    total_branch_row = {
        "cabang": "TOTAL CABANG",
        "share_pct": 100.0,
        "daily_curr": round(tot_branch_curr_trx, 1),
        "daily_prev": round(tot_branch_prev_trx, 1),
        "diff_trx": me.calculate_daily_growth(tot_branch_curr_trx, tot_branch_prev_trx)["growth_diff"],
        "daily_mem_curr": round(tot_branch_curr_mem, 1),
        "daily_mem_prev": round(tot_branch_prev_mem, 1),
        "diff_mem": round(tot_branch_curr_mem - tot_branch_prev_mem, 1),
        "tpm_curr": tot_tpm_c,
        "tpm_prev": tot_tpm_p,
        "diff_tpm": round(tot_tpm_c - tot_tpm_p, 2),
    }

    # 4. PERFORMANSI PRODUK (SESUAI GAMBAR DEPAS)
    kat_map = {pid: v["kategori"] for pid, v in prod_map.items()}
    op_map  = {pid: v["operator"] for pid, v in prod_map.items()}

    df_curr_pid = df_curr_all["product_id"].astype(str).str.strip().str.upper()
    df_curr_all["kategori"] = df_curr_pid.map(kat_map).fillna("LAINNYA")
    df_curr_all["operator"] = df_curr_pid.map(op_map).fillna("LAINNYA")

    df_prev_pid = df_prev_all["product_id"].astype(str).str.strip().str.upper()
    df_prev_all["kategori"] = df_prev_pid.map(kat_map).fillna("LAINNYA")
    df_prev_all["operator"] = df_prev_pid.map(op_map).fillna("LAINNYA")

    def calc_metrics(df_sub, days):
        if df_sub.empty:
            return {
                "daily_trx": 0.0,
                "sukses_pct": 0.0,
                "avg_dur_sec": 0.0,
                "dur_str": "00:00",
                "net_arpu": 0.0,
                "arpu_int": 0
            }
        tot = len(df_sub)
        sukses_df = df_sub[df_sub["is_sukses"]]
        sukses_cnt = len(sukses_df)
        d_trx = me.calculate_daily_rate(sukses_cnt, days)
        s_rate = round(float(sukses_cnt / tot * 100), 1) if tot > 0 else 0.0
        dur_avg = float(sukses_df["durasi_sec"].mean()) if not sukses_df.empty else 0.0
        
        # Net ARPU sesuai Hukum 2 GEMINI.md (Base Price / Trx Sukses)
        net_rev = float(sukses_df["base_price"].sum()) if not sukses_df.empty else 0.0
        net_arpu = me.calculate_net_arpu(net_rev, sukses_cnt)

        return {
            "daily_trx": d_trx,
            "sukses_pct": s_rate,
            "avg_dur_sec": dur_avg,
            "dur_str": me.format_duration_str(dur_avg),
            "net_arpu": net_arpu,
            "arpu_int": int(round(net_arpu))
        }

    def build_row(name, level, row_type, m_c, m_p):
        diff_arpu = int(round(m_c["net_arpu"] - m_p["net_arpu"]))
        growth_arpu_pct = round((diff_arpu / m_p["net_arpu"] * 100), 1) if m_p["net_arpu"] > 0 else 0.0
        return {
            "name": name,
            "level": level,
            "type": row_type,
            "daily_curr": m_c["daily_trx"],
            "daily_prev": m_p["daily_trx"],
            "diff_trx": me.calculate_daily_growth(m_c["daily_trx"], m_p["daily_trx"])["growth_diff"],
            "sukses_curr": m_c["sukses_pct"],
            "sukses_prev": m_p["sukses_pct"],
            "diff_sukses": round(m_c["sukses_pct"] - m_p["sukses_pct"], 1),
            "dur_curr_str": m_c["dur_str"],
            "dur_prev_str": m_p["dur_str"],
            "diff_dur_sec": int(round(m_c["avg_dur_sec"] - m_p["avg_dur_sec"])),
            "arpu_curr": m_c["arpu_int"],
            "arpu_prev": m_p["arpu_int"],
            "diff_arpu": diff_arpu,
            "growth_arpu_pct": growth_arpu_pct
        }

    # Build exact hierarchy list
    prod_rows = []
    max_prod_trx = 1.0

    # 1. TELCO
    c_telco = df_curr_all[df_curr_all["kategori"] == "TELCO"]
    p_telco = df_prev_all[df_prev_all["kategori"] == "TELCO"]
    m_c_telco = calc_metrics(c_telco, days_curr)
    m_p_telco = calc_metrics(p_telco, days_prev)

    if m_c_telco["daily_trx"] > max_prod_trx:
        max_prod_trx = m_c_telco["daily_trx"]

    prod_rows.append(build_row("TELCO", 0, "category", m_c_telco, m_p_telco))

    # Operators under TELCO
    for op in cfg["telco_operators"]:
        c_op = c_telco[c_telco["operator"] == op]
        p_op = p_telco[p_telco["operator"] == op]
        m_c_op = calc_metrics(c_op, days_curr)
        m_p_op = calc_metrics(p_op, days_prev)

        prod_rows.append(build_row(op, 1, "operator", m_c_op, m_p_op))

    # Other categories (EWALLET, TOKEN PLN, PPOB, VOUCHER GAME, TRANSFER STOK, etc.)
    other_cats = [c for c in cfg["categories"] if c != "TELCO"]
    present_cats = set(df_curr_all["kategori"].dropna().unique()).union(set(df_prev_all["kategori"].dropna().unique()))
    for c in sorted(present_cats):
        if c != "TELCO" and c != "LAINNYA" and c not in other_cats:
            other_cats.append(c)
    if "LAINNYA" in present_cats and "LAINNYA" not in other_cats:
        other_cats.append("LAINNYA")
    for cat in other_cats:
        c_cat = df_curr_all[df_curr_all["kategori"] == cat]
        p_cat = df_prev_all[df_prev_all["kategori"] == cat]
        m_c_cat = calc_metrics(c_cat, days_curr)
        m_p_cat = calc_metrics(p_cat, days_prev)

        if m_c_cat["daily_trx"] > max_prod_trx:
            max_prod_trx = m_c_cat["daily_trx"]

        prod_rows.append(build_row(cat, 0, "category", m_c_cat, m_p_cat))

    # Hitung bar_pct relative to max_prod_trx
    for r in prod_rows:
        r["bar_pct"] = round(float(r["daily_curr"] / max_prod_trx * 100), 1) if max_prod_trx > 0 else 0.0

    # GRAND TOTAL PRODUCT ROW
    m_c_grand = calc_metrics(df_curr_all, days_curr)
    m_p_grand = calc_metrics(df_prev_all, days_prev)

    grand_total_prod = build_row("GRAND TOTAL", 0, "grand_total", m_c_grand, m_p_grand)
    grand_total_prod["bar_pct"] = 100.0

    res = {
        "brand": brand,
        "curr_month": curr_month,
        "prev_month": prev_month,
        "days_curr": days_curr,
        "days_prev": days_prev,
        "kpi": kpi,
        "daily_chart": daily_chart,
        "branches": branches,
        "total_branch": total_branch_row,
        "products": prod_rows,
        "grand_total_prod": grand_total_prod
    }
    _DAILY_REPORT_CACHE[cache_key] = res
    return res
