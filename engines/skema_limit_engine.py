"""
engines/skema_limit_engine.py
Engine Analisa Skema Harga (Pricelist Group) & Limit Saldo ASTAGA / OKIPAY.

Hukum Bisnis (GEMINI.md Rule #1, #2, #8, #11):
- Total Trx Sukses dihitung murni dari COUNTROWS status Sukses (BUKAN SUM(qty)).
- Pembagi Daily Trx wajib Global Server Active Days (Cut-off Server).
- Akun internal ASTAGA wajib di-exclude (AR00037, AR00009, AR20408).
- Plafon limit saldo ditampilkan sebagai nominal positif (Rp).
- Hierarki Group Pricelist: D > M > MV > R > RV > RL > P > O.
"""

import os
import sqlite3
import calendar
from typing import Dict, Any, List
import pandas as pd
import numpy as np

import engines.transaction_engine as te
import engines.metrics_engine as me

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "MASTER", "master_data.db")

# Kamus Nama Resmi Group Pricelist (GEMINI.md Hukum 11)
GROUP_NAMES = {
    "D": "Dealer",
    "M": "Master",
    "MV": "Master Verified",
    "R": "Reseller",
    "RV": "Reseller Verified",
    "RL": "Reseller Limit",
    "P": "Prima",
    "O": "Online",
    "S": "Special",
    "PL": "Prima Limitless",
    "PN": "Prima Network"
}

# Urutan Hierarki Pricelist (D > M > MV > R > RV > RL > P > O)
GROUP_ORDER = {
    "D": 1,
    "M": 2,
    "MV": 3,
    "R": 4,
    "RV": 5,
    "RL": 6,
    "P": 7,
    "O": 8,
    "PL": 9,
    "PN": 10,
    "S": 11
}

# Cache L1 In-Memory
_SKEMA_LIMIT_RAM_CACHE: Dict[str, Any] = {}
_SKEMA_LIMIT_MTIME: float = 0.0


def clear_skema_limit_cache():
    """Hapus cache in-memory skema limit."""
    global _SKEMA_LIMIT_RAM_CACHE, _SKEMA_LIMIT_MTIME
    _SKEMA_LIMIT_RAM_CACHE.clear()
    _SKEMA_LIMIT_MTIME = 0.0


def calculate_skema_limit(brand: str = "ASTAGA", year: str = "2026", month: str = "10") -> Dict[str, Any]:
    """
    Kalkulasi Analisa Skema Harga (Pricelist Group) & Limit Saldo.
    Mendukung brand ASTAGA dan OKIPAY, serta filter tahun dan bulan (atau 'ALL').
    """
    global _SKEMA_LIMIT_RAM_CACHE, _SKEMA_LIMIT_MTIME
    brand_clean = str(brand).strip().upper()
    if brand_clean not in ("ASTAGA", "OKIPAY"):
        brand_clean = "ASTAGA"
    
    year_str = str(year).strip()
    month_str = str(month).strip()

    cache_key = f"{brand_clean}_{year_str}_{month_str}"
    if cache_key in _SKEMA_LIMIT_RAM_CACHE:
        return _SKEMA_LIMIT_RAM_CACHE[cache_key]
    
    # 1. Load Master Agents & Resellers dari SQLite
    if not os.path.exists(DB_PATH):
        return {"error": "Database master_data.db tidak ditemukan", "brand": brand_clean}

    with sqlite3.connect(DB_PATH) as conn:
        df_agents = pd.read_sql_query("""
            SELECT 
                a.agen_id, 
                a.nama_agen, 
                a.cabang, 
                COALESCE(a.type, 'Prima') as type, 
                COALESCE(r.grup, 'UNKNOWN') as grup,
                COALESCE(ABS(a.limit_saldo), 0) as limit_saldo
            FROM agents a
            LEFT JOIN resellers r ON a.agen_id = r.kode_reseller
            WHERE a.brand = ?
        """, conn, params=(brand_clean,))

        df_reseller_map = pd.read_sql_query("""
            SELECT kode_reseller, root_agen_id 
            FROM resellers 
            WHERE brand = ?
        """, conn, params=(brand_clean,))

    if df_agents.empty:
        return {"error": f"Tidak ada data agen untuk brand {brand_clean}", "brand": brand_clean}

    df_agents["grup_clean"] = df_agents["grup"].astype(str).str.strip().str.upper()
    reseller_to_root = dict(zip(df_reseller_map["kode_reseller"], df_reseller_map["root_agen_id"]))

    # Hitung total agen terdaftar di master per (type, grup_clean)
    master_counts = df_agents.groupby(["type", "grup_clean"]).size().to_dict()

    # 2. Load Data Transaksi dari Parquet
    try:
        df_trx = te.load(brand_clean, year_str if year_str != "ALL" else "2026")
    except Exception as e:
        return {"error": f"Gagal memuat transaksi: {str(e)}", "brand": brand_clean}

    if df_trx.empty:
        return {
            "brand": brand_clean,
            "year": year_str,
            "month": month_str,
            "active_days": 0,
            "summary": {},
            "groups_limit": [],
            "groups_non_limit": [],
            "groups_prima": [],
            "rekap": []
        }

    # Filter Akun Internal ASTAGA (GEMINI.md Rule #4)
    if brand_clean == "ASTAGA":
        df_trx = me.filter_astaga_internal(df_trx)

    # Pastikan kolom-kolom tanggal & status siap
    if "ym" not in df_trx.columns:
        df_trx["ym"] = df_trx["tgl_entry"].dt.strftime("%Y-%m")
    if "is_sukses" not in df_trx.columns:
        df_trx["is_sukses"] = df_trx["status"].astype(str).str.lower().str.contains("sukses", na=False)

    # Filter Bulan jika dispesifikasikan (misal "10" atau "2026-10")
    if month_str != "ALL":
        target_ym = f"{year_str}-{month_str.zfill(2)}" if "-" not in month_str else month_str
        df_filtered = df_trx[(df_trx["ym"] == target_ym) & (df_trx["is_sukses"])].copy()
    else:
        df_filtered = df_trx[df_trx["is_sukses"]].copy()

    # Hitung Jumlah Hari Aktif Cut-Off Server (Global Server, GEMINI.md Rule #1)
    active_days = me.get_active_days(df_filtered)
    if active_days <= 0:
        active_days = 1

    # Mapping transaksi ke root_agen_id
    df_filtered["ar_clean"] = df_filtered["ar_id"].astype(str).str.strip().str.upper()
    df_filtered["root_agen_id"] = df_filtered["ar_clean"].map(reseller_to_root).fillna(df_filtered["ar_clean"])

    # Agregasi transaksi per root_agen_id (Frekuensi baris = Hits)
    agent_trx = df_filtered.groupby("root_agen_id").size().rename("total_trx_sukses").reset_index()

    # Gabungkan dengan data master agen
    df_merged = pd.merge(df_agents, agent_trx, left_on="agen_id", right_on="root_agen_id", how="left")
    df_merged["total_trx_sukses"] = df_merged["total_trx_sukses"].fillna(0).astype(int)
    df_merged["is_active"] = df_merged["total_trx_sukses"] > 0

    # Ambil agen yang AKTIF bertransaksi pada periode ini
    df_active = df_merged[df_merged["is_active"]].copy()
    total_agen_aktif_all = len(df_active)
    total_trx_sukses_all = int(df_active["total_trx_sukses"].sum())
    daily_trx_global = round(total_trx_sukses_all / active_days, 1)
    total_limit_disalurkan_all = float(df_active["limit_saldo"].sum())

    # Agregasi grup per Tipe
    def _build_tier_table(tipe_name: str) -> List[Dict[str, Any]]:
        sub_df = df_active[df_active["type"] == tipe_name]
        if sub_df.empty:
            return []
        
        grouped = sub_df.groupby("grup_clean").agg(
            agen_aktif=("agen_id", "count"),
            total_trx=("total_trx_sukses", "sum"),
            total_limit=("limit_saldo", "sum")
        ).reset_index()

        grouped["order"] = grouped["grup_clean"].map(lambda g: GROUP_ORDER.get(g, 99))
        grouped = grouped.sort_values(by=["order", "total_trx"], ascending=[True, False])

        rows = []
        for _, r in grouped.iterrows():
            g_code = str(r["grup_clean"])
            g_aktif = int(r["agen_aktif"])
            g_master = int(master_counts.get((tipe_name, g_code), g_aktif))
            keaktifan_pct = round((g_aktif / g_master * 100), 1) if g_master > 0 else 100.0
            trx_val = int(r["total_trx"])
            d_trx = round(trx_val / active_days, 1)
            lim_val = float(r["total_limit"])
            avg_lim = round(lim_val / g_aktif) if g_aktif > 0 else 0.0
            # Yield Produktivitas: Daily Trx per 1 Juta Limit Saldo
            yield_val = round((d_trx / (lim_val / 1_000_000)), 2) if lim_val > 0 else 0.0

            rows.append({
                "grup": g_code,
                "nama_grup": GROUP_NAMES.get(g_code, g_code),
                "agen_aktif": g_aktif,
                "agen_master": g_master,
                "keaktifan_pct": keaktifan_pct,
                "total_trx": trx_val,
                "daily_trx": d_trx,
                "total_limit": lim_val,
                "avg_limit": avg_lim,
                "yield_prod": yield_val
            })
        return rows

    groups_limit = _build_tier_table("Limit")
    groups_non_limit = _build_tier_table("Non Limit")
    groups_prima = _build_tier_table("Prima")

    # Subtotal per Tipe
    def _calc_subtotal(rows: List[Dict[str, Any]], tipe_name: str) -> Dict[str, Any]:
        s_aktif = sum(r["agen_aktif"] for r in rows)
        s_master = sum(r["agen_master"] for r in rows)
        s_trx = sum(r["total_trx"] for r in rows)
        s_d_trx = round(sum(r["daily_trx"] for r in rows), 1)
        s_limit = sum(r["total_limit"] for r in rows)
        s_avg_lim = round(s_limit / s_aktif) if s_aktif > 0 else 0.0
        s_pct_aktif = round((s_aktif / s_master * 100), 1) if s_master > 0 else 0.0
        s_yield = round((s_d_trx / (s_limit / 1_000_000)), 2) if s_limit > 0 else 0.0
        s_porsi_trx = round((s_trx / total_trx_sukses_all * 100), 1) if total_trx_sukses_all > 0 else 0.0
        s_porsi_agen = round((s_aktif / total_agen_aktif_all * 100), 1) if total_agen_aktif_all > 0 else 0.0

        return {
            "type": tipe_name,
            "agen_aktif": s_aktif,
            "agen_master": s_master,
            "keaktifan_pct": s_pct_aktif,
            "porsi_agen_pct": s_porsi_agen,
            "total_trx": s_trx,
            "daily_trx": s_d_trx,
            "porsi_trx_pct": s_porsi_trx,
            "total_limit": s_limit,
            "avg_limit": s_avg_lim,
            "yield_prod": s_yield
        }

    sub_limit = _calc_subtotal(groups_limit, "Limit")
    sub_non_limit = _calc_subtotal(groups_non_limit, "Non Limit")
    sub_prima = _calc_subtotal(groups_prima, "Prima")

    # Rekapitulasi Tabel Utama (Prima, Limit, Non Limit)
    rekap_list = [sub_prima, sub_limit, sub_non_limit]

    # Grand Total
    grand_total = {
        "agen_aktif": total_agen_aktif_all,
        "total_trx": total_trx_sukses_all,
        "daily_trx": daily_trx_global,
        "total_limit": total_limit_disalurkan_all,
        "active_days": active_days
    }

    # Summary KPI Cards
    summary_cards = {
        "total_limit": total_limit_disalurkan_all,
        "total_limit_str": f"Rp {total_limit_disalurkan_all:,.0f}".replace(",", "."),
        "total_limit_saldo": total_limit_disalurkan_all,
        "total_limit_saldo_str": f"Rp {total_limit_disalurkan_all:,.0f}".replace(",", "."),
        "limit_daily_trx": sub_limit.get("daily_trx", 0.0),
        "limit_porsi_trx": sub_limit.get("porsi_trx_pct", 0.0),
        "prima_daily_trx": sub_prima.get("daily_trx", 0.0),
        "prima_porsi_trx": sub_prima.get("porsi_trx_pct", 0.0),
        "total_agen_aktif": total_agen_aktif_all,
        "global_daily_trx": daily_trx_global,
        "active_days": active_days
    }

    result = {
        "brand": brand_clean,
        "year": year_str,
        "month": month_str,
        "active_days": active_days,
        "summary": summary_cards,
        "groups_limit": groups_limit,
        "subtotal_limit": sub_limit,
        "groups_non_limit": groups_non_limit,
        "subtotal_non_limit": sub_non_limit,
        "groups_prima": groups_prima,
        "subtotal_prima": sub_prima,
        "rekap": rekap_list,
        "grand_total": grand_total
    }

    _SKEMA_LIMIT_RAM_CACHE[cache_key] = result
    return result
