"""
engines/agen_engine.py
Engine Analisa Induk Agen khusus ASTAGA (Rollup / Agregasi Seluruh Reseller Anak).
Mencakup:
1. Agregasi Transaksi Rollup per Agen Induk (Akumulasi seluruh reseller anak)
2. Utilisasi Reseller: Berapa anak yang aktif transaksi vs total anak terdaftar di Agen
3. Profil Agen: SCO, DSO, Cabang, Jadwal Kunjungan, Plafon Limit Kredit, Status Toko
4. Tracking Keaktifan Agen: Aktif Rutin, Baru / Reaktivasi, Pasif / Churn vs Bulan Lalu
5. Breakdown Komposisi Produk (% EWALLET, TELCO, PPOB, TOKEN PLN)
"""

import os
import json
import pandas as pd
import numpy as np
from typing import Dict, Any, List
import engines.transaction_engine as te
import engines.product_engine as pe
import engines.reseller_engine as re
import engines.metrics_engine as me

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, ".cache")

_AGEN_DASHBOARD_CACHE: Dict[tuple, Dict[str, Any]] = {}


def clear_agen_dashboard_cache():
    """Bersihkan in-memory cache dashboard agen."""
    global _AGEN_DASHBOARD_CACHE
    _AGEN_DASHBOARD_CACHE.clear()


def calculate_agen_dashboard(brand: str = "ASTAGA", month_code: str = None, year: str = "2026") -> Dict[str, Any]:
    """
    Hitung statistik terpadu Level Induk Agen ASTAGA / OKIPAY (Rollup / Agregasi Reseller):
    - Metrik Keaktifan Agen (Total, Aktif, Rutin, Baru, Churn)
    - Tabel Agen dengan utilisasi anak (% Reseller Aktif), limit, SCO, cabang, % EWALLET
    - Daftar reseller anak per agen untuk modal drilldown
    """
    global _AGEN_DASHBOARD_CACHE
    brand = (brand or "ASTAGA").strip().upper()
    cache_key = (brand, str(year), str(month_code or ""))
    if cache_key in _AGEN_DASHBOARD_CACHE:
        return _AGEN_DASHBOARD_CACHE[cache_key]

    df = te.load(brand, year)
    if brand == "ASTAGA":
        df = me.filter_astaga_internal(df)
    reseller_meta, agen_meta = re.load_master_meta(brand)
    if brand == "ASTAGA":
        reseller_meta = {k: v for k, v in reseller_meta.items() if str(k).strip().upper() not in me.EXCLUDED_ASTAGA_ACCOUNTS}
        agen_meta = {k: v for k, v in agen_meta.items() if str(k).strip().upper() not in me.EXCLUDED_ASTAGA_ACCOUNTS}
    prod_map = pe.get_product_map(brand)

    # Sukses only & month tagging
    if "is_sukses" not in df.columns:
        df["is_sukses"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False)
    if "ym" not in df.columns:
        df["ym"] = df["tgl_entry"].dt.strftime("%Y-%m")

    df_sukses = df[df["is_sukses"]]
    available_months = sorted([str(m) for m in df_sukses["ym"].dropna().unique().tolist() if str(m).startswith(str(year))])
    if not available_months:
        return {"ok": False, "error": "Tidak ada data transaksi"}

    if not month_code or month_code not in available_months:
        month_code = available_months[-1]

    idx = available_months.index(month_code)
    prev_month = available_months[idx - 1] if idx > 0 else None

    # Mapping Reseller ID -> Agen ID
    # Jika reseller tidak punya Agen id terdaftar, default Agen id = Reseller ID itu sendiri
    reseller_to_agen = {}
    for rid, rmeta in reseller_meta.items():
        aid = rmeta.get("agen_id")
        reseller_to_agen[rid] = aid if aid else rid

    # Mapping Agen -> Daftar Seluruh Reseller Anak yang terdaftar di master
    agen_children_registered = {}
    for rid, rmeta in reseller_meta.items():
        aid = reseller_to_agen.get(rid, rid)
        agen_children_registered.setdefault(aid, []).append({
            "kode": rid,
            "name": rmeta.get("name", rid),
            "group": rmeta.get("group", "-"),
            "cabang": rmeta.get("cabang", "-")
        })

    df_curr = df_sukses[df_sukses["ym"] == month_code].copy()
    df_prev = df_sukses[df_sukses["ym"] == prev_month].copy() if prev_month else pd.DataFrame()

    # Tag transaksi ke Agen ID
    df_curr["agen_id"] = df_curr["ar_id"].map(reseller_to_agen).fillna(df_curr["ar_id"])
    if not df_prev.empty:
        df_prev["agen_id"] = df_prev["ar_id"].map(reseller_to_agen).fillna(df_prev["ar_id"])

    curr_agens = set(df_curr["agen_id"].unique())
    prev_agens = set(df_prev["agen_id"].unique()) if not df_prev.empty else set()

    # Identifikasi agen baru bulan berjalan dari master data
    new_reg_month_agens = {
        aid for aid, m in agen_meta.items()
        if (m.get("tgl_daftar") or "").startswith(month_code)
    }

    # 1. Baru & Langsung Transaksi
    new_active_set = curr_agens & new_reg_month_agens
    # 2. Reaktivasi (Akun lama yang bangun kembali setelah 0 di bulan lalu)
    reactivated_set = (curr_agens - prev_agens) - new_reg_month_agens
    # 3. Aktif Rutin (Bulan lalu transaksi, bulan ini juga transaksi)
    retained_set = (curr_agens & prev_agens) - new_reg_month_agens
    # 4. Pasif / Churn (Bulan lalu ada transaksi, bulan ini 0 transaksi)
    churn_set = prev_agens - curr_agens
    # 5. Baru Terdaftar tapi Belum Transaksi
    new_untransacted_set = new_reg_month_agens - curr_agens

    # Map Kategori Produk
    def map_category(pid):
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

    df_curr["cat"] = df_curr["product_id"].map(map_category)

    # Agregasi cepat per agen_id
    ct = pd.crosstab(df_curr["agen_id"], df_curr["cat"])
    for col in ["EWALLET", "TELCO", "PPOB", "TOKEN PLN"]:
        if col not in ct.columns:
            ct[col] = 0
    ct["total_trx"] = ct.sum(axis=1)
    ct = ct.rename(columns={
        "EWALLET": "ewallet_trx",
        "TELCO": "telco_trx",
        "PPOB": "ppob_trx",
        "TOKEN PLN": "token_trx"
    }).reset_index()

    # Hitung keaktifan anak (jumlah reseller unik bertransaksi per agen)
    active_children_count = df_curr.groupby("agen_id")["ar_id"].nunique().to_dict()

    # Hitung jumlah hari aktif di bulan berjalan dan bulan lalu untuk perbandingan daily run-rate
    days_curr = me.get_active_days(df_curr)
    days_prev = me.get_active_days(df_prev) if not df_prev.empty else 1

    # Hitung detail transaksi per reseller anak untuk modal drilldown
    anak_trx_counts = df_curr.groupby(["agen_id", "ar_id"]).size().to_dict()

    # Hitung transaksi bulan lalu per agen untuk analisa MoM dan growth
    df_prev_counts = df_prev["agen_id"].value_counts().to_dict() if not df_prev.empty else {}

    rows = []
    for _, r in ct.iterrows():
        aid = r["agen_id"]
        ameta = agen_meta.get(aid, {
            "agen_name": aid,
            "cabang": "UNKNOWN",
            "type": "Non Limit",
            "sco": "-",
            "dso": "-",
            "jadwal": "-",
            "limit": 0.0,
            "status": "-",
            "tgl_daftar": "-"
        })

        tot = int(r["total_trx"])
        ew = int(r["ewallet_trx"])
        pct_ew = round((ew / tot * 100), 1) if tot > 0 else 0.0

        prev_t = int(df_prev_counts.get(aid, 0))
        growth_t = tot - prev_t
        growth_p = round(((tot - prev_t) / prev_t * 100), 1) if prev_t > 0 else (100.0 if tot > 0 else 0.0)

        # Hitung run-rate harian (Daily Trx) via metrics_engine
        d_curr = me.calculate_daily_rate(tot, days_curr)
        d_prev = me.calculate_daily_rate(prev_t, days_prev)
        d_growth = me.calculate_daily_growth(d_curr, d_prev)
        g_daily = d_growth["growth_diff"]
        g_daily_pct = d_growth["growth_pct"]

        if aid in new_active_set:
            activity_status = "Member Baru"
        elif aid in reactivated_set:
            activity_status = "Reaktivasi"
        else:
            activity_status = "Aktif Rutin"

        # Anak-anak reseller terdaftar
        reg_children = agen_children_registered.get(aid, [])
        total_child = len(reg_children)
        # Jika tidak terdaftar di sheet reseller, anggap agen bertransaksi sebagai 1 outlet
        if total_child == 0:
            total_child = 1

        active_child = int(active_children_count.get(aid, 0))
        pct_active_child = round((active_child / total_child * 100), 1) if total_child > 0 else 0.0

        # Siapkan list anak dengan transaksi bulan ini untuk modal drilldown
        children_list = []
        for c in reg_children:
            cid = c["kode"]
            c_trx = int(anak_trx_counts.get((aid, cid), 0))
            children_list.append({
                "kode": cid,
                "name": c["name"],
                "cabang": c.get("cabang", ameta.get("cabang", "-")),
                "trx_month": c_trx,
                "is_active": c_trx > 0
            })
        children_list.sort(key=lambda x: x["trx_month"], reverse=True)

        rows.append({
            "agen_id": aid,
            "agen_name": ameta["agen_name"],
            "cabang": ameta["cabang"],
            "type": ameta.get("type", "Non Limit"),
            "sco": ameta["sco"],
            "dso": ameta.get("dso", "-"),
            "jadwal": ameta["jadwal"],
            "limit": ameta["limit"],
            "status": ameta["status"],
            "tgl_daftar": ameta.get("tgl_daftar", "-"),
            "total_reseller": total_child,
            "active_reseller": active_child,
            "pct_active_reseller": pct_active_child,
            "total_trx": tot,
            "prev_trx": prev_t,
            "growth_trx": growth_t,
            "growth_pct": growth_p,
            "daily_curr": d_curr,
            "daily_prev": d_prev,
            "growth_daily": g_daily,
            "growth_daily_pct": g_daily_pct,
            "ewallet_trx": ew,
            "pct_ewallet": pct_ew,
            "telco_trx": int(r["telco_trx"]),
            "ppob_trx": int(r["ppob_trx"]),
            "token_trx": int(r["token_trx"]),
            "activity_status": activity_status,
            "children": children_list
        })

    # Tambahkan Agen Churned/Pasif (Bulan lalu bertransaksi, tapi bulan ini 0 transaksi)
    churn_rows = []
    if prev_month and not df_prev.empty:
        for cid in churn_set:
            ameta = agen_meta.get(cid, {
                "agen_name": cid,
                "cabang": "UNKNOWN",
                "type": "Non Limit",
                "sco": "-",
                "dso": "-",
                "jadwal": "-",
                "limit": 0.0,
                "status": "-",
                "tgl_daftar": "-"
            })
            reg_children = agen_children_registered.get(cid, [])
            total_child = len(reg_children) if len(reg_children) > 0 else 1
            prev_t = int(df_prev_counts.get(cid, 0))
            d_prev = me.calculate_daily_rate(prev_t, days_prev)
            d_growth = me.calculate_daily_growth(0.0, d_prev)

            churn_rows.append({
                "agen_id": cid,
                "agen_name": ameta["agen_name"],
                "cabang": ameta["cabang"],
                "type": ameta.get("type", "Non Limit"),
                "sco": ameta["sco"],
                "dso": ameta.get("dso", "-"),
                "jadwal": ameta["jadwal"],
                "limit": ameta["limit"],
                "status": ameta["status"],
                "tgl_daftar": ameta.get("tgl_daftar", "-"),
                "total_reseller": total_child,
                "active_reseller": 0,
                "pct_active_reseller": 0.0,
                "total_trx": 0,
                "prev_trx": prev_t,
                "growth_trx": -prev_t,
                "growth_pct": -100.0 if prev_t > 0 else 0.0,
                "daily_curr": 0.0,
                "daily_prev": d_prev,
                "growth_daily": d_growth["growth_diff"],
                "growth_daily_pct": d_growth["growth_pct"],
                "ewallet_trx": 0,
                "pct_ewallet": 0.0,
                "telco_trx": 0,
                "ppob_trx": 0,
                "token_trx": 0,
                "activity_status": "Pasif / Churn",
                "children": []
            })

    rows.sort(key=lambda x: x["total_trx"], reverse=True)
    churn_rows.sort(key=lambda x: x["prev_trx"], reverse=True)

    # Hitung Bottom 10 & Top 10 Induk Agen (Sesuai GEMINI.md Rule 1 & 5: Menggunakan Daily Trx run-rate MoM via metrics_engine)
    growth_candidates = [r for r in rows if r.get("daily_prev", 0) > 0] + [cr for cr in churn_rows if cr.get("daily_prev", 0) > 0]
    
    # Bottom 10: Penurunan Daily Trx harian terbesar
    growth_candidates_bottom = sorted(growth_candidates, key=lambda x: (x.get("growth_daily", 0), x.get("growth_daily_pct", 0)))
    bottom_growth_10 = growth_candidates_bottom[:10]

    # Top 10: Kenaikan Daily Trx harian tertinggi
    growth_candidates_top = sorted(growth_candidates, key=lambda x: (x.get("growth_daily", 0), x.get("growth_daily_pct", 0)), reverse=True)
    top_growth_10 = growth_candidates_top[:10]

    all_cabangs = sorted(list(set(r["cabang"] for r in rows if r["cabang"] and r["cabang"] != "UNKNOWN")))

    tot_trx_all = int(ct["total_trx"].sum()) if not ct.empty else 0
    tot_ew_all = int(ct["ewallet_trx"].sum()) if not ct.empty else 0
    avg_ew = float(round((tot_ew_all / tot_trx_all * 100), 1)) if tot_trx_all > 0 else 0.0

    result = {
        "ok": True,
        "selected_month": month_code,
        "prev_month": prev_month,
        "days_curr": days_curr,
        "days_prev": days_prev,
        "available_months": available_months,
        "kpi": {
            "total_registered": int(len(agen_meta)),
            "active_current": int(len(curr_agens)),
            "retained": int(len(retained_set)),
            "new_registered": int(len(new_reg_month_agens)),
            "new_active": int(len(new_active_set)),
            "new_untransacted": int(len(new_untransacted_set)),
            "new_reactivated": int(len(new_active_set) + len(reactivated_set)),
            "reactivated": int(len(reactivated_set)),
            "churned": int(len(churn_set)),
            "total_trx": tot_trx_all,
            "total_ewallet": tot_ew_all,
            "avg_pct_ewallet": avg_ew
        },
        "all_cabangs": all_cabangs,
        "rows": rows,
        "churn_rows": churn_rows,
        "bottom_growth_10": bottom_growth_10,
        "top_growth_10": top_growth_10
    }

    _AGEN_DASHBOARD_CACHE[cache_key] = result
    if not month_code:
        _AGEN_DASHBOARD_CACHE[(str(year), str(result["selected_month"]))] = result
    return result


def calculate_tren_agen(brand: str = "ASTAGA", force: bool = False) -> Dict[str, Any]:
    """
    Hitung tren daily run-rate transaksi 12 bulan terakhir (Nov 2025 - Okt 2026)
    serta evaluasi pertumbuhan YoY (Oktober 2026 vs Oktober 2025) per Toko Induk Agen.
    """
    brand = (brand or "ASTAGA").strip().upper()
    json_path = os.path.join(CACHE_DIR, f"tren_agen_{brand.lower()}_1yr.json")
    if not force and os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as fp:
                return json.load(fp)
        except Exception:
            pass

    import time
    t0 = time.time()
    parts_dir = os.path.join(CACHE_DIR, "parts")
    os.makedirs(parts_dir, exist_ok=True)

    reseller_meta, agen_meta = re.load_master_meta(brand)
    if brand == "ASTAGA":
        reseller_meta = {k: v for k, v in reseller_meta.items() if str(k).strip().upper() not in me.EXCLUDED_ASTAGA_ACCOUNTS}
        agen_meta = {k: v for k, v in agen_meta.items() if str(k).strip().upper() not in me.EXCLUDED_ASTAGA_ACCOUNTS}

    reseller_to_agen = {}
    for rid, rmeta in reseller_meta.items():
        aid = rmeta.get("agen_id")
        reseller_to_agen[rid] = aid if aid else rid

    # 12 Bulan Terakhir (Nov 2025 s/d Okt 2026)
    prefix_2026 = "OP" if brand == "OKIPAY" else ""
    months_config = [
        ("1125", "Nov 25", os.path.join(parts_dir, f"{brand.lower()}_2025_1125.parquet")),
        ("1225", "Des 25", os.path.join(parts_dir, f"{brand.lower()}_2025_1225.parquet")),
        ("0126", "Jan 26", os.path.join(parts_dir, f"{brand.lower()}_2026_{prefix_2026}0126.parquet")),
        ("0226", "Feb 26", os.path.join(parts_dir, f"{brand.lower()}_2026_{prefix_2026}0226.parquet")),
        ("0326", "Mar 26", os.path.join(parts_dir, f"{brand.lower()}_2026_{prefix_2026}0326.parquet")),
        ("0426", "Apr 26", os.path.join(parts_dir, f"{brand.lower()}_2026_{prefix_2026}0426.parquet")),
        ("0526", "Mei 26", os.path.join(parts_dir, f"{brand.lower()}_2026_{prefix_2026}0526.parquet")),
        ("0626", "Jun 26", os.path.join(parts_dir, f"{brand.lower()}_2026_{prefix_2026}0626.parquet")),
        ("0726", "Jul 26", os.path.join(parts_dir, f"{brand.lower()}_2026_{prefix_2026}0726.parquet")),
        ("0826", "Agu 26", os.path.join(parts_dir, f"{brand.lower()}_2026_{prefix_2026}0826.parquet")),
        ("0926", "Sep 26", os.path.join(parts_dir, f"{brand.lower()}_2026_{prefix_2026}0926.parquet")),
        ("1026", "Okt 26", os.path.join(parts_dir, f"{brand.lower()}_2026_{prefix_2026}1026.parquet")),
    ]

    month_agen_daily = {}
    month_headers = []

    for m_code, m_label, fpath in months_config:
        if not os.path.exists(fpath):
            continue
        df = pd.read_parquet(fpath, columns=["ar_id", "status", "tgl_entry"])
        df_sukses = df[df["status"].str.lower().str.contains("sukses", na=False)]
        days = me.get_active_days(df_sukses)
        agen_series = df_sukses["ar_id"].map(reseller_to_agen).fillna(df_sukses["ar_id"])
        counts = agen_series.value_counts()
        daily_rates = {k: me.calculate_daily_rate(v, days) for k, v in counts.items()}
        month_agen_daily[m_code] = daily_rates
        month_headers.append({
            "code": m_code,
            "label": m_label,
            "days": days,
            "is_latest": (m_code == "1026")
        })

    # YoY Base: 1025 (Oktober 2025)
    f_1025 = os.path.join(parts_dir, f"{brand.lower()}_2025_1025.parquet")
    daily_1025 = {}
    days_1025 = 31
    if os.path.exists(f_1025):
        df_1025 = pd.read_parquet(f_1025, columns=["ar_id", "status", "tgl_entry"])
        df_1025_sukses = df_1025[df_1025["status"].str.lower().str.contains("sukses", na=False)]
        days_1025 = me.get_active_days(df_1025_sukses)
        counts_1025 = df_1025_sukses["ar_id"].map(reseller_to_agen).fillna(df_1025_sukses["ar_id"]).value_counts()
        daily_1025 = {k: me.calculate_daily_rate(v, days_1025) for k, v in counts_1025.items()}

    all_aids = set(agen_meta.keys())
    for m_code in month_agen_daily:
        all_aids.update(month_agen_daily[m_code].keys())
    all_aids.update(daily_1025.keys())
    if brand == "ASTAGA":
        all_aids = {aid for aid in all_aids if aid not in me.EXCLUDED_ASTAGA_ACCOUNTS}

    agent_rows = []
    for aid in all_aids:
        meta = agen_meta.get(aid, {
            "agen_name": aid, "cabang": "ONLINE" if brand == "OKIPAY" else "UNKNOWN", "sco": "NON SCO",
            "type": "Non Limit", "limit": 0.0, "jadwal": "-", "status": "-"
        })

        monthly_map = {}
        vals = []
        has_any = False
        for m in month_headers:
            c = m["code"]
            val = round(float(month_agen_daily.get(c, {}).get(aid, 0.0)), 1)
            monthly_map[c] = val
            vals.append(val)
            if val > 0:
                has_any = True

        yoy_base = round(float(daily_1025.get(aid, 0.0)), 1)
        if yoy_base > 0:
            has_any = True
        if not has_any:
            continue

        curr_val = monthly_map.get("1026", 0.0)
        diff_yoy = round(curr_val - yoy_base, 1)
        pct_yoy = round((diff_yoy / yoy_base * 100), 1) if yoy_base > 0 else (100.0 if curr_val > 0 else 0.0)

        agent_rows.append({
            "aid": aid,
            "name": meta.get("agen_name", aid),
            "cabang": meta.get("cabang", "ONLINE" if brand == "OKIPAY" else "UNKNOWN"),
            "sco": meta.get("sco", "NON SCO"),
            "type": meta.get("type", "Non Limit"),
            "limit": float(meta.get("limit", 0.0)),
            "jadwal": meta.get("jadwal", "-"),
            "status": meta.get("status", "-"),
            "monthly": monthly_map,
            "sparkline": vals,
            "max_val": max(vals) if vals else 0.0,
            "curr_val": curr_val,
            "yoy_base": yoy_base,
            "diff_yoy": diff_yoy,
            "pct_yoy": pct_yoy,
            "trend": "UP" if diff_yoy >= 0 else "DOWN"
        })

    agent_rows.sort(key=lambda x: x["curr_val"], reverse=True)
    all_cabangs = sorted(list(set(r["cabang"] for r in agent_rows if r["cabang"] and r["cabang"] != "UNKNOWN")))
    all_scos = sorted(list(set(r["sco"] for r in agent_rows if r["sco"] and r["sco"] != "-")))

    payload = {
        "ok": True,
        "brand": brand,
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "months": month_headers,
        "yoy_baseline": {"code": "1025", "label": "Okt 25", "days": days_1025},
        "agents_count": len(agent_rows),
        "all_cabangs": all_cabangs,
        "all_scos": all_scos,
        "agents": agent_rows
    }

    try:
        with open(json_path, "w", encoding="utf-8") as fp:
            json.dump(payload, fp)
    except Exception as e:
        print(f"[WARN] Gagal menyimpan cache {json_path}: {e}")

    return payload
