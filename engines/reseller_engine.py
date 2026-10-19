"""
engines/reseller_engine.py
Engine Analisa Customer & Reseller khusus ASTAGA.
Mencakup:
1. Ringkasan & Profil Customer (Pencarian, Cabang, Status Limit, Jadwal, SCO)
2. Analisa Komposisi Produk & % EWALLET per Reseller (Monthly & Yearly)
3. Tracking Keaktifan Reseller: Aktif, Reseller Baru/Reaktivasi, Pasif/Churn vs Bulan Lalu
"""

import os
import json
import pandas as pd
import numpy as np
from typing import Dict, Any, List
import engines.transaction_engine as te
import engines.product_engine as pe
import engines.metrics_engine as me

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
CUST_ASTAGA = os.path.join(MASTER_DIR, "CUSTOMER_ASTAGA.xlsx")


DB_PATH = os.path.join(MASTER_DIR, "master_data.db")

_MASTER_META_CACHE = {}
_META_MTIME = 0


def load_master_meta(brand: str = "ASTAGA"):
    """Load profil master customer & reseller ASTAGA/OKIPAY (cached in RAM & fast JSON / SQLite)."""
    global _MASTER_META_CACHE, _META_MTIME
    brand = (brand or "ASTAGA").strip().upper()
    mtime = max(
        os.path.getmtime(DB_PATH) if os.path.exists(DB_PATH) else 0,
        os.path.getmtime(CUST_ASTAGA) if os.path.exists(CUST_ASTAGA) else 0
    )
    if brand in _MASTER_META_CACHE and _META_MTIME == mtime:
        return _MASTER_META_CACHE[brand]

    # 1. Coba baca dari database SQLite master_data.db
    if os.path.exists(DB_PATH):
        try:
            import sqlite3
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("SELECT agen_id, nama_agen, cabang, type, sco, dso, jadwal, limit_saldo, markup, tgl_daftar FROM agents WHERE brand = ?", (brand,))
            agen_rows = cur.fetchall()
            agen_meta = {}
            for aid, nama, cab, tipe, sco, dso, jadwal, lim, mk, tgld in agen_rows:
                raw_name = nama or aid
                clean_name = raw_name
                if '-' in raw_name and raw_name.upper().startswith(aid.upper()):
                    clean_name = raw_name.split('-', 1)[1].strip()
                t_val = me.classify_astaga_agent_type(limit_saldo=lim, cabang=cab, existing_type=tipe)
                sco_val = me.normalize_astaga_sco(cab, sco) if brand == "ASTAGA" else (sco or "NON SCO")
                agen_meta[aid] = {
                    "agen_name": clean_name or aid,
                    "raw_name": raw_name,
                    "cabang": cab or ("ONLINE" if brand == "OKIPAY" else "BSD"),
                    "type": t_val,
                    "sco": sco_val,
                    "dso": dso or "-",
                    "jadwal": jadwal or "-",
                    "limit": float(lim or 0.0),
                    "markup": float(mk or 0.0),
                    "tgl_daftar": str(tgld or "").strip(),
                    "status": "-"
                }

            cur.execute("SELECT kode_reseller, nama_reseller, grup, root_agen_id, cabang, limit_saldo, markup, tgl_daftar FROM resellers WHERE brand = ?", (brand,))
            reseller_rows = cur.fetchall()
            reseller_meta = {}
            for rid, nama, grup, aid, cab, lim, mk, tgld in reseller_rows:
                am = agen_meta.get(aid, {})
                lim_f = float(lim or 0.0)
                cab_f = cab or am.get("cabang", "ONLINE" if brand == "OKIPAY" else "BSD")
                grup_f = str(grup or "").strip().upper()
                if lim_f != 0:
                    r_type = "Limit"
                elif cab_f.upper() == "ONLINE" or grup_f == "P":
                    r_type = "Prima"
                else:
                    r_type = "Non Limit"

                reseller_meta[rid] = {
                    "kode": rid,
                    "name": nama or rid,
                    "group": grup or "-",
                    "cabang": cab_f,
                    "type": r_type,
                    "agen_id": aid or "",
                    "agen_name": am.get("agen_name", "-"),
                    "sco": am.get("sco", "-"),
                    "jadwal": am.get("jadwal", "-"),
                    "limit": lim_f,
                    "markup": float(mk or 0.0),
                    "tgl_daftar": str(tgld or "").strip(),
                    "status": "-"
                }
            conn.close()

            # Fallback jika agen_meta belum punya tgl_daftar, warisi dari data registrasi reseller ID yang sama
            for aid, am in agen_meta.items():
                if not am.get("tgl_daftar") and aid in reseller_meta:
                    am["tgl_daftar"] = reseller_meta[aid].get("tgl_daftar", "")

            # Exclude akun internal operasional ASTAGA (AR00037, AR00009) khusus ASTAGA
            if brand == "ASTAGA":
                reseller_meta = {k: v for k, v in reseller_meta.items() if str(k).strip().upper() not in me.EXCLUDED_ASTAGA_ACCOUNTS}
                agen_meta = {k: v for k, v in agen_meta.items() if str(k).strip().upper() not in me.EXCLUDED_ASTAGA_ACCOUNTS}

            _MASTER_META_CACHE[brand] = (reseller_meta, agen_meta)
            _META_MTIME = mtime
            return reseller_meta, agen_meta
        except Exception as e:
            print(f"[WARN] Gagal membaca reseller meta dari SQLite: {e}")

    # 2. Fallback lama ke Excel jika DB belum ada
    if not os.path.exists(CUST_ASTAGA):
        return {}, {}

    with xl:
        s_res = next((s for s in xl.sheet_names if "reseller" in s.lower()), "Reseller")
        df_r = pd.read_excel(xl, sheet_name=s_res)
        s_agen = "Mapping_Agen" if "Mapping_Agen" in xl.sheet_names else ("Agen" if "Agen" in xl.sheet_names else xl.sheet_names[0])
        df_a = pd.read_excel(xl, sheet_name=s_agen)

    for c in ["Kode Reseller", "Reseller Name", "Group", "Agen id", "Cabang"]:
        if c in df_r.columns:
            df_r[c] = df_r[c].fillna("").astype(str).str.replace("\xa0", " ").str.strip()

    for c in ["AGEN ID", "NAMA AGEN", "AGEN NAME", "CABANG", "SCO", "DSO", "JADWAL", "LIMIT", "STATUS"]:
        if c in df_a.columns:
            df_a[c] = df_a[c].fillna("").astype(str).str.replace("\xa0", " ").str.strip()

    # Map nama toko langsung dari sheet Reseller
    direct_res_names = {}
    if "Kode Reseller" in df_r.columns and "Reseller Name" in df_r.columns:
        direct_res_names = dict(zip(df_r["Kode Reseller"], df_r["Reseller Name"]))

    # Agen profiles
    agen_meta = {}
    for _, row in df_a.iterrows():
        aid = row["AGEN ID"]
        try:
            lim_val = float(row.get("LIMIT", 0))
        except Exception:
            lim_val = 0.0

        raw_name = str(row.get("NAMA AGEN") or row.get("AGEN NAME") or "").strip()

        # Bersihkan prefix seperti 'AR08869-'
        clean_name = raw_name
        if "-" in raw_name and raw_name.upper().startswith(aid.upper()):
            clean_name = raw_name.split("-", 1)[1].strip()

        # Fallback ke direct reseller name
        if (not clean_name or clean_name == aid) and aid in direct_res_names:
            clean_name = direct_res_names[aid]

        if not clean_name:
            clean_name = raw_name if raw_name else aid

        cab_str = str(row.get("CABANG", "")).strip()
        t_val = me.classify_astaga_agent_type(limit_saldo=lim_val, cabang=cab_str, existing_type=row.get("TYPE", ""))

        agen_meta[aid] = {
            "agen_name": clean_name,
            "raw_name": raw_name,
            "cabang": row.get("CABANG", "UNKNOWN"),
            "type": t_val,
            "sco": row.get("SCO", "-"),
            "dso": row.get("DSO", "-"),
            "jadwal": row.get("JADWAL", "-"),
            "limit": lim_val,
            "status": row.get("STATUS", "-")
        }

    # Reseller meta
    reseller_meta = {}
    for _, row in df_r.iterrows():
        rid = row["Kode Reseller"]
        aid = row.get("Agen id", "")
        am = agen_meta.get(aid, {})
        lim_f = float(am.get("limit", 0.0))
        cab_f = row.get("Cabang", am.get("cabang", "UNKNOWN"))
        grup_f = str(row.get("Group", "-")).strip().upper()
        if lim_f != 0:
            r_type = "Limit"
        elif cab_f.upper() == "ONLINE" or grup_f == "P":
            r_type = "Prima"
        else:
            r_type = "Non Limit"

        reseller_meta[rid] = {
            "kode": rid,
            "name": row.get("Reseller Name", rid),
            "group": row.get("Group", "-"),
            "cabang": cab_f,
            "type": r_type,
            "agen_id": aid,
            "agen_name": am.get("agen_name", "-"),
            "sco": am.get("sco", "-"),
            "jadwal": am.get("jadwal", "-"),
            "limit": lim_f,
            "status": am.get("status", "-")
        }

    _RESELLER_META_CACHE = reseller_meta
    _AGEN_META_CACHE = agen_meta
    _META_MTIME = mtime

    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        with open(json_cache, "w", encoding="utf-8") as fp:
            json.dump({"reseller": reseller_meta, "agen": agen_meta}, fp)
    except Exception:
        pass

    return reseller_meta, agen_meta


def clear_master_meta_cache():
    """Bersihkan cache master meta (reseller & agen) di RAM untuk seluruh brand."""
    global _MASTER_META_CACHE, _META_MTIME
    _MASTER_META_CACHE.clear()
    _META_MTIME = 0


_RESELLER_DASHBOARD_CACHE: Dict[tuple, Dict[str, Any]] = {}


def clear_reseller_dashboard_cache():
    """Bersihkan in-memory cache dashboard reseller."""
    global _RESELLER_DASHBOARD_CACHE
    _RESELLER_DASHBOARD_CACHE.clear()


def calculate_reseller_dashboard(brand: str = "ASTAGA", month_code: str = None, year: str = "2026") -> Dict[str, Any]:
    """
    Hitung statistik terpadu Customer & Reseller ASTAGA / OKIPAY:
    - Metrik Keaktifan (Total, Aktif, Baru, Pasif/Churn)
    - Tabel Reseller dengan pencarian, filter status & cabang, serta % EWALLET
    """
    global _RESELLER_DASHBOARD_CACHE
    brand = (brand or "ASTAGA").strip().upper()
    cache_key = (brand, str(year), str(month_code or ""))
    if cache_key in _RESELLER_DASHBOARD_CACHE:
        return _RESELLER_DASHBOARD_CACHE[cache_key]

    df = te.load(brand, year)
    if brand == "ASTAGA":
        df = me.filter_astaga_internal(df)
    reseller_meta, _ = load_master_meta(brand)
    prod_map = pe.get_product_map(brand)

    # Sukses only & month tagging (cached on df)
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

    df_curr = df_sukses[df_sukses["ym"] == month_code]
    df_prev = df_sukses[df_sukses["ym"] == prev_month] if prev_month else pd.DataFrame()

    curr_resellers = set(df_curr["ar_id"].unique())
    prev_resellers = set(df_prev["ar_id"].unique()) if not df_prev.empty else set()

    # Identifikasi pendaftar baru bulan berjalan dari master data
    new_reg_month_all = {
        rid for rid, m in reseller_meta.items()
        if (m.get("tgl_daftar") or "").startswith(month_code)
    }

    # 1. Baru & Langsung Transaksi (First-time Conversion)
    new_active_set = curr_resellers & new_reg_month_all
    # 2. Reaktivasi (Akun lama yang bangun kembali setelah 0 di bulan lalu)
    reactivated_set = (curr_resellers - prev_resellers) - new_reg_month_all
    # 3. Aktif Rutin (Bulan lalu transaksi, bulan ini juga transaksi)
    retained_set = (curr_resellers & prev_resellers) - new_reg_month_all
    # 4. Pasif / Churn (Bulan lalu ada transaksi, bulan ini 0 transaksi)
    churn_set = prev_resellers - curr_resellers
    # 5. Baru Terdaftar tapi Belum Transaksi
    new_untransacted_set = new_reg_month_all - curr_resellers

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

    df_curr_copy = df_curr.copy()
    df_curr_copy["cat"] = df_curr_copy["product_id"].map(map_category)

    # Aggregasi per reseller di bulan berjalan secara vektorisasi super cepat (<0.1s)
    ct = pd.crosstab(df_curr_copy["ar_id"], df_curr_copy["cat"])
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
    agg_reseller = ct

    # Hitung jumlah hari aktif di bulan berjalan dan bulan lalu untuk perbandingan daily run-rate
    days_curr = me.get_active_days(df_curr)
    days_prev = me.get_active_days(df_prev) if not df_prev.empty else 1
    df_prev_counts = df_prev["ar_id"].value_counts().to_dict() if not df_prev.empty else {}

    # Gabungkan dengan data master
    rows = []
    for _, r in agg_reseller.iterrows():
        rid = r["ar_id"]
        meta = reseller_meta.get(rid, {
            "name": rid,
            "group": "-",
            "cabang": "UNKNOWN",
            "type": "Non Limit",
            "agen_id": "-",
            "agen_name": "-",
            "sco": "-",
            "jadwal": "-",
            "limit": 0.0,
            "status": "-",
            "tgl_daftar": "-"
        })

        tot = int(r["total_trx"])
        ew = int(r["ewallet_trx"])
        pct_ew = round((ew / tot * 100), 1) if tot > 0 else 0.0

        prev_t = int(df_prev_counts.get(rid, 0))
        growth_t = tot - prev_t
        growth_p = round(((tot - prev_t) / prev_t * 100), 1) if prev_t > 0 else (100.0 if tot > 0 else 0.0)

        # Hitung run-rate harian (Daily Trx)
        d_curr = me.calculate_daily_rate(tot, days_curr)
        d_prev = me.calculate_daily_rate(prev_t, days_prev)
        d_growth = me.calculate_daily_growth(d_curr, d_prev)
        g_daily = d_growth["growth_diff"]
        g_daily_pct = d_growth["growth_pct"]

        if rid in new_active_set:
            activity_status = "Member Baru"
        elif rid in reactivated_set:
            activity_status = "Reaktivasi"
        else:
            activity_status = "Aktif Rutin"

        rows.append({
            "kode": rid,
            "name": meta["name"],
            "group": meta["group"],
            "cabang": meta["cabang"],
            "type": meta.get("type", "Non Limit"),
            "agen_id": meta.get("agen_id", "-"),
            "agen_name": meta.get("agen_name", "-"),
            "sco": meta["sco"],
            "jadwal": meta["jadwal"],
            "limit": meta["limit"],
            "tgl_daftar": meta.get("tgl_daftar", "-"),
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
            "activity_status": activity_status
        })

    # Tambahkan reseller churned/pasif (yang ada di bulan lalu tapi 0 di bulan ini)
    churn_rows = []
    if prev_month:
        for cid in churn_set:
            meta = reseller_meta.get(cid, {
                "name": cid,
                "group": "-",
                "cabang": "UNKNOWN",
                "type": "Non Limit",
                "agen_id": "-",
                "agen_name": "-",
                "sco": "-",
                "jadwal": "-",
                "limit": 0.0,
                "tgl_daftar": "-"
            })
            prev_t = int(df_prev_counts.get(cid, 0))
            d_prev = me.calculate_daily_rate(prev_t, days_prev)
            d_growth = me.calculate_daily_growth(0.0, d_prev)

            churn_rows.append({
                "kode": cid,
                "name": meta["name"],
                "group": meta["group"],
                "cabang": meta["cabang"],
                "type": meta.get("type", "Non Limit"),
                "agen_id": meta.get("agen_id", "-"),
                "agen_name": meta.get("agen_name", "-"),
                "sco": meta["sco"],
                "jadwal": meta["jadwal"],
                "limit": meta["limit"],
                "tgl_daftar": meta.get("tgl_daftar", "-"),
                "total_trx": 0,
                "prev_trx": prev_t,
                "growth_trx": -prev_t,
                "growth_pct": -100.0,
                "daily_curr": 0.0,
                "daily_prev": d_prev,
                "growth_daily": d_growth["growth_diff"],
                "growth_daily_pct": -100.0,
                "activity_status": "Pasif / Churn"
            })

    rows.sort(key=lambda x: x["daily_curr"], reverse=True)
    churn_rows.sort(key=lambda x: x["daily_prev"], reverse=True)

    # Cabang-cabang yang tersedia
    all_cabangs = sorted(list(set(r["cabang"] for r in rows if r["cabang"])))

    result = {
        "ok": True,
        "selected_month": month_code,
        "prev_month": prev_month,
        "available_months": available_months,
        "days_curr": days_curr,
        "days_prev": days_prev,
        "kpi": {
            "total_registered": int(len(reseller_meta)),
            "active_current": int(len(curr_resellers)),
            "retained": int(len(retained_set)),
            "new_registered": int(len(new_reg_month_all)),
            "new_active": int(len(new_active_set)),
            "new_untransacted": int(len(new_untransacted_set)),
            "new_reactivated": int(len(new_active_set) + len(reactivated_set)),
            "reactivated": int(len(reactivated_set)),
            "churned": int(len(churn_set)),
            "total_trx": int(agg_reseller["total_trx"].sum()),
            "daily_rate_total": me.calculate_daily_rate(agg_reseller["total_trx"].sum(), days_curr),
            "days_curr": days_curr,
            "days_prev": days_prev,
            "total_ewallet": int(agg_reseller["ewallet_trx"].sum()),
            "avg_pct_ewallet": float(round((agg_reseller["ewallet_trx"].sum() / agg_reseller["total_trx"].sum() * 100), 1)) if agg_reseller["total_trx"].sum() > 0 else 0.0
        },
        "all_cabangs": all_cabangs,
        "rows": rows,
        "churn_rows": churn_rows
    }

    _RESELLER_DASHBOARD_CACHE[cache_key] = result
    if not month_code:
        _RESELLER_DASHBOARD_CACHE[(str(year), str(result["selected_month"]))] = result
    return result
