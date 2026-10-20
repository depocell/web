"""
engines/sco_engine.py
Engine komputasi performa harian & tren Sales Coordinator (SCO).
100% mandiri di dalam C:\\WEB REPORT, memanfaatkan cache Parquet super cepat.
Muara akhir output: C:\\WEB REPORT\\pages\\sco\\data_sco.json -> push ke GitHub (https://github.com/depocell/SCO).
"""

import os
import sys
import json
import datetime
import subprocess
import pandas as pd
import numpy as np
import engines.metrics_engine as me

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
SCO_DIR = os.path.join(BASE_DIR, "pages", "sco")
KPI_EXCEL_PATH = os.path.join(SCO_DIR, "KPI_SCO.xlsx")
JSON_OUTPUT = os.path.join(SCO_DIR, "data_sco.json")
RESELLER_JSON_OUTPUT = os.path.join(SCO_DIR, "data_reseller.json")

SCO_PERSONNEL = [
    ('Abdul Harris', 'ICON'),
    ('Febri Kurniawan', 'PP'),
    ('Hupron', 'BSD'),
    ('Khoirul Anan', 'PRG'),
    ('Mas Komarjaya', 'PP'),
]
SCO_NAMES = [s[0] for s in SCO_PERSONNEL]
NON_SCO_BRANCHES = ['BSD', 'ICON', 'PP', 'PRG']

BULAN_SHORT_ID = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
    '05': 'Mei', '06': 'Jun', '07': 'Jul', '08': 'Agu',
    '09': 'Sep', '10': 'Okt', '11': 'Nov', '12': 'Des'
}

BULAN_SHORT_EN = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
}


def load_master_customers():
    """
    Load mapping reseller -> agen dan profil agen dari cache parquet atau database SQLite master_data.db.
    """
    agen_pq = os.path.join(CACHE_DIR, "agen_astaga.parquet")
    reseller_pq = os.path.join(CACHE_DIR, "reseller_astaga.parquet")
    db_path = os.path.join(MASTER_DIR, "master_data.db")
    db_mtime = os.path.getmtime(db_path) if os.path.exists(db_path) else 0

    # 1. Load Agen (sheet Mapping_Agen / Agen)
    if os.path.exists(agen_pq) and (db_mtime == 0 or os.path.getmtime(agen_pq) >= db_mtime):
        df_a = pd.read_parquet(agen_pq)
    else:
        try:
            import sqlite3
            with sqlite3.connect(db_path) as conn:
                df_a = pd.read_sql_query("""
                    SELECT agen_id AS "AGEN ID", nama_agen AS "AGEN NAME", cabang AS CABANG,
                           type AS TYPE, sco AS SCO, dso AS DSO, jadwal AS JADWAL,
                           location AS LOCATION, 1 AS STATUS
                    FROM agents WHERE brand = ?
                """, conn, params=('ASTAGA',))
            for c in df_a.columns:
                df_a[c] = df_a[c].fillna("").astype(str).str.strip()
            os.makedirs(CACHE_DIR, exist_ok=True)
            df_a.to_parquet(agen_pq, index=False)
        except Exception:
            p_cust = os.path.join(MASTER_DIR, "CUSTOMER_ASTAGA.xlsx")
            if os.path.exists(p_cust):
                with pd.ExcelFile(p_cust, engine="openpyxl") as xl:
                    s_name = "Mapping_Agen" if "Mapping_Agen" in xl.sheet_names else ("Agen" if "Agen" in xl.sheet_names else xl.sheet_names[0])
                    df_a = pd.read_excel(xl, sheet_name=s_name)
                for c in df_a.columns:
                    df_a[c] = df_a[c].fillna("").astype(str).str.replace("\xa0", " ").str.strip()
            else:
                df_a = pd.DataFrame()

    # 2. Load Reseller
    if os.path.exists(reseller_pq) and (db_mtime == 0 or os.path.getmtime(reseller_pq) >= db_mtime):
        df_r = pd.read_parquet(reseller_pq)
    else:
        try:
            import sqlite3
            with sqlite3.connect(db_path) as conn:
                df_r = pd.read_sql_query("""
                    SELECT kode_reseller AS "Kode Reseller", nama_reseller AS "Reseller Name",
                           grup AS "Group", root_agen_id AS "Agen id", cabang AS Cabang
                    FROM resellers WHERE brand = ?
                """, conn, params=('ASTAGA',))
            for c in df_r.columns:
                df_r[c] = df_r[c].fillna("").astype(str).str.strip()
            os.makedirs(CACHE_DIR, exist_ok=True)
            df_r.to_parquet(reseller_pq, index=False)
        except Exception:
            p_cust = os.path.join(MASTER_DIR, "CUSTOMER_ASTAGA.xlsx")
            if os.path.exists(p_cust):
                with pd.ExcelFile(p_cust, engine="openpyxl") as xl:
                    s_name = next((s for s in xl.sheet_names if "reseller" in s.lower()), "Reseller")
                    df_r = pd.read_excel(xl, sheet_name=s_name)
                for c in df_r.columns:
                    df_r[c] = df_r[c].fillna("").astype(str).str.replace("\xa0", " ").str.strip()
            else:
                df_r = pd.DataFrame()

    df_r["Kode Reseller"] = df_r["Kode Reseller"].astype(str).str.replace("\xa0", " ").str.strip()
    df_r["Agen id"] = df_r["Agen id"].astype(str).str.replace("\xa0", " ").str.strip()
    reseller_to_agen = dict(zip(df_r["Kode Reseller"], df_r["Agen id"]))

    df_a["AGEN ID"] = df_a["AGEN ID"].astype(str).str.strip()
    agen_profiles = {}
    for _, row in df_a.iterrows():
        aid = str(row["AGEN ID"]).strip()
        raw_name = str(row.get("NAMA AGEN", row.get("AGEN NAME", ""))).strip()
        if raw_name and raw_name.lower() != "nan":
            if not raw_name.startswith(aid):
                full_name = f"{aid} - {raw_name}"
            else:
                full_name = raw_name
        else:
            full_name = aid

        agen_profiles[aid] = {
            "name": full_name,
            "cabang": str(row.get("CABANG", "")).strip(),
            "sco": str(row.get("SCO", "")).strip(),
            "type": str(row.get("TYPE", "")).strip(),
            "location": str(row.get("LOCATION", "")).strip(),
            "jadwal": str(row.get("JADWAL", "")).strip(),
            "limit": float(row.get("LIMIT", 0)) if pd.notna(row.get("LIMIT")) and row.get("LIMIT") != "" else 0.0,
            "status": str(row.get("STATUS", "")).strip(),
        }

    return reseller_to_agen, agen_profiles, df_a, df_r


def is_stale():
    """
    Cek apakah data_sco.json perlu di-regenerate.
    Return True jika:
      - data_sco.json belum ada, ATAU
      - trx_astaga_2026.parquet lebih baru dari data_sco.json, ATAU
      - master_data.db lebih baru dari data_sco.json, ATAU
      - KPI_SCO.xlsx lebih baru dari data_sco.json.
    """
    if not os.path.exists(JSON_OUTPUT) or not os.path.exists(RESELLER_JSON_OUTPUT):
        return True

    json_mtime = min(os.path.getmtime(JSON_OUTPUT), os.path.getmtime(RESELLER_JSON_OUTPUT))

    # Cek parquet cache
    p_trx = os.path.join(CACHE_DIR, "trx_astaga_2026.parquet")
    if os.path.exists(p_trx) and os.path.getmtime(p_trx) > json_mtime:
        return True

    # Cek master data DB
    p_master = os.path.join(MASTER_DIR, "master_data.db")
    if os.path.exists(p_master) and os.path.getmtime(p_master) > json_mtime:
        return True

    # Cek KPI excel
    if os.path.exists(KPI_EXCEL_PATH) and os.path.getmtime(KPI_EXCEL_PATH) > json_mtime:
        return True

    return False


def generate_sco_data():
    """
    Kalkulasi penuh performa SCO dari transaksi Parquet 2026.
    Menghasilkan data_sco.json di pages/sco/data_sco.json.
    """
    p_trx = os.path.join(CACHE_DIR, "trx_astaga_2026.parquet")
    if not os.path.exists(p_trx):
        # Auto build cache jika belum ada
        import engines.transaction_engine as te
        te.build_cache("ASTAGA", "2026")

    df_trx = pd.read_parquet(p_trx)
    df_trx = me.filter_astaga_internal(df_trx)
    df_sukses = df_trx[df_trx["status"].astype(str).str.lower().str.contains("sukses", na=False)].copy()

    # Ekstrak tanggal dan kode bulan
    df_sukses["tgl_dt"] = pd.to_datetime(df_sukses["tgl_entry"])
    df_sukses["Date"] = df_sukses["tgl_dt"].dt.strftime("%Y-%m-%d")
    df_sukses["MonthCode"] = df_sukses["tgl_dt"].dt.strftime("%m%y")
    df_sukses["ar_id"] = df_sukses["ar_id"].astype(str).str.strip()

    # Load master
    reseller_to_agen, agen_profiles, df_a, df_r = load_master_customers()

    # Vectorized mapping
    df_sukses["AGEN_ID"] = df_sukses["ar_id"].map(reseller_to_agen).fillna(df_sukses["ar_id"])
    
    # Map SCO & Cabang
    def get_sco_cabang(aid):
        prof = agen_profiles.get(aid)
        if prof:
            return prof.get("sco", "UNKNOWN"), prof.get("cabang", "UNKNOWN")
        return "UNKNOWN", "UNKNOWN"

    sco_cb_map = {aid: (p["sco"], p["cabang"]) for aid, p in agen_profiles.items()}
    sco_series = df_sukses["AGEN_ID"].map(lambda x: sco_cb_map.get(x, ("UNKNOWN", "UNKNOWN"))[0])
    cb_series = df_sukses["AGEN_ID"].map(lambda x: sco_cb_map.get(x, ("UNKNOWN", "UNKNOWN"))[1])
    
    df_sukses["SCO"] = sco_series
    df_sukses["CABANG"] = cb_series

    is_sco = df_sukses["SCO"].isin(SCO_NAMES)
    is_online = (df_sukses["SCO"] == "ONLINE") | (df_sukses["CABANG"] == "ONLINE")

    df_sukses["C_SCO"] = np.where(is_sco, df_sukses["SCO"], np.where(is_online, "ONLINE", "NON SCO"))
    df_sukses["C_CB"] = np.where(is_online, "ONLINE", df_sukses["CABANG"])

    # Temukan semua bulan yang ada
    months = sorted(df_sukses["MonthCode"].unique().tolist(), key=lambda x: ("20" + x[2:] + x[:2]))

    target_scos = set(SCO_NAMES + ["ONLINE"])
    month_cat_counts = {}
    month_agen_counts = {}
    harian_json_list = []
    month_meta = {}

    for m in months:
        mm = m[:2]
        label_en = BULAN_SHORT_EN.get(mm, mm)
        label_id = BULAN_SHORT_ID.get(mm, mm)

        df_m = df_sukses[df_sukses["MonthCode"] == m]
        days_count = me.get_active_days(df_m, date_col="tgl_dt")
        last_date = df_m["Date"].max() if not df_m.empty else ""
        last_dt_formatted = ""
        if last_date:
            try:
                last_dt_formatted = datetime.datetime.strptime(last_date, "%Y-%m-%d").strftime("%d-%m-%Y")
            except Exception:
                last_dt_formatted = last_date

        month_meta[m] = {
            "label": label_en,
            "label_id": label_id,
            "days": days_count,
            "cutoff_date": last_dt_formatted
        }

        # Group by category (SCO, CABANG)
        grp_cat = df_m.groupby(["C_SCO", "C_CB"]).size()
        month_cat_counts[m] = {k: me.calculate_daily_rate(v, days_count) for k, v in grp_cat.to_dict().items()}

        # Group by AGEN_ID
        grp_agen = df_m.groupby("AGEN_ID").size()
        month_agen_counts[m] = {k: me.calculate_daily_rate(v, days_count) for k, v in grp_agen.to_dict().items()}

        # Daily trends
        df_h = df_m.groupby(["Date", "C_SCO"]).size().reset_index(name="Trx")
        for _, r in df_h.iterrows():
            harian_json_list.append({
                "month_code": m,
                "bulan": label_en,
                "tanggal": r["Date"],
                "nama_sco": r["C_SCO"],
                "trx": int(r["Trx"])
            })

    # 1. BUILD MULTI-PERIOD INDEX SUMMARY
    periods = {}
    periods_list = []

    for i, m_curr in enumerate(months):
        m_prev = months[i - 1] if i > 0 else None
        meta_curr = month_meta[m_curr]
        label_curr = meta_curr["label"]
        days_curr = meta_curr["days"]
        cutoff_curr = meta_curr["cutoff_date"]

        if m_prev:
            meta_prev = month_meta[m_prev]
            label_prev = meta_prev["label"]
            days_prev = meta_prev["days"]
            period_label = f"{meta_curr['label_id']} 20{m_curr[2:]} (vs {meta_prev['label_id']})"
        else:
            label_prev = "-"
            days_prev = 1
            period_label = f"{meta_curr['label_id']} 20{m_curr[2:]}"

        counts_curr = month_cat_counts.get(m_curr, {})
        counts_prev = month_cat_counts.get(m_prev, {}) if m_prev else {}

        index_rows = []

        # A. SCO Personnel
        tot_sco_prev, tot_sco_curr = 0.0, 0.0
        for sco_name, cabang in SCO_PERSONNEL:
            v_prev = counts_prev.get((sco_name, cabang), 0.0)
            v_curr = counts_curr.get((sco_name, cabang), 0.0)
            tot_sco_prev += v_prev
            tot_sco_curr += v_curr
            growth = v_curr - v_prev
            pct = (growth / v_prev) if v_prev > 0 else 0.0
            index_rows.append({
                "SCO": sco_name,
                "CABANG": cabang,
                "prev": v_prev,
                "curr": v_curr,
                label_prev: v_prev,
                label_curr: v_curr,
                "Growth": growth,
                "%": pct
            })

        growth_sco = tot_sco_curr - tot_sco_prev
        pct_sco = (growth_sco / tot_sco_prev) if tot_sco_prev > 0 else 0.0
        index_rows.append({
            "SCO": "TOTAL SCO",
            "CABANG": None,
            "prev": tot_sco_prev,
            "curr": tot_sco_curr,
            label_prev: tot_sco_prev,
            label_curr: tot_sco_curr,
            "Growth": growth_sco,
            "%": pct_sco
        })

        # B. Non SCO Branches
        tot_non_prev, tot_non_curr = 0.0, 0.0
        for b in NON_SCO_BRANCHES:
            v_prev = counts_prev.get(("NON SCO", b), 0.0)
            v_curr = counts_curr.get(("NON SCO", b), 0.0)
            tot_non_prev += v_prev
            tot_non_curr += v_curr
            growth = v_curr - v_prev
            pct = (growth / v_prev) if v_prev > 0 else 0.0
            index_rows.append({
                "SCO": "NON SCO",
                "CABANG": b,
                "prev": v_prev,
                "curr": v_curr,
                label_prev: v_prev,
                label_curr: v_curr,
                "Growth": growth,
                "%": pct
            })

        growth_non = tot_non_curr - tot_non_prev
        pct_non = (growth_non / tot_non_prev) if tot_non_prev > 0 else 0.0
        index_rows.append({
            "SCO": "TOTAL NON SCO",
            "CABANG": None,
            "prev": tot_non_prev,
            "curr": tot_non_curr,
            label_prev: tot_non_prev,
            label_curr: tot_non_curr,
            "Growth": growth_non,
            "%": pct_non
        })

        # C. ONLINE
        v_on_prev = counts_prev.get(("ONLINE", "ONLINE"), 0.0)
        v_on_curr = counts_curr.get(("ONLINE", "ONLINE"), 0.0)
        growth_on = v_on_curr - v_on_prev
        pct_on = (growth_on / v_on_prev) if v_on_prev > 0 else 0.0
        index_rows.append({
            "SCO": "ONLINE",
            "CABANG": "ONLINE",
            "prev": v_on_prev,
            "curr": v_on_curr,
            label_prev: v_on_prev,
            label_curr: v_on_curr,
            "Growth": growth_on,
            "%": pct_on
        })

        # D. Grand Total
        gt_prev = tot_sco_prev + tot_non_prev + v_on_prev
        gt_curr = tot_sco_curr + tot_non_curr + v_on_curr
        growth_gt = gt_curr - gt_prev
        pct_gt = (growth_gt / gt_prev) if gt_prev > 0 else 0.0
        index_rows.append({
            "SCO": "Grand Total",
            "CABANG": None,
            "prev": gt_prev,
            "curr": gt_curr,
            label_prev: gt_prev,
            label_curr: gt_curr,
            "Growth": growth_gt,
            "%": pct_gt
        })

        periods[m_curr] = {
            "code": m_curr,
            "prev_code": m_prev,
            "label": period_label,
            "curr_name": label_curr,
            "prev_name": label_prev,
            "days_curr": days_curr,
            "days_prev": days_prev,
            "cutoff_date": cutoff_curr,
            "index": index_rows
        }

        periods_list.append({
            "code": m_curr,
            "label": period_label,
            "curr_name": label_curr,
            "prev_name": label_prev,
            "prev_code": m_prev,
            "is_latest": (i == len(months) - 1)
        })

    periods_list.reverse()
    latest_m = months[-1]
    prev_latest_m = months[-2] if len(months) > 1 else None

    # 2. GENERATE TREN_AGEN DATA
    tren_agen_rows = []
    latest_curr_label = month_meta[latest_m]["label"]
    latest_prev_label = month_meta[prev_latest_m]["label"] if prev_latest_m else "Prev"

    for aid, prof in agen_profiles.items():
        sco = prof["sco"]
        cabang = prof["cabang"]
        is_target = (sco in target_scos) or (cabang == "ONLINE")

        monthly_avg = {m: round(month_agen_counts[m].get(aid, 0.0), 2) for m in months}
        has_trx = any(v > 0 for v in monthly_avg.values())

        if is_target or has_trx:
            disp_sco = "ONLINE" if (cabang == "ONLINE" or sco == "ONLINE") else sco
            avg_curr = monthly_avg.get(latest_m, 0.0)
            avg_prev = monthly_avg.get(prev_latest_m, 0.0) if prev_latest_m else 0.0
            diff = avg_curr - avg_prev
            growth_pct = (diff / avg_prev) if avg_prev > 0 else (0.0 if avg_curr == 0 else 1.0)

            row_data = {
                "aid": aid,
                "name": prof["name"],
                "cabang": cabang,
                "type": prof["type"],
                "sco": disp_sco,
                "location": prof["location"],
                "jadwal": prof["jadwal"],
                "limit": prof["limit"],
                "status": prof["status"],
                "avg_prev": avg_prev,
                "avg_curr": avg_curr,
                "diff": diff,
                "growth": growth_pct,
                latest_prev_label: avg_prev,
                latest_curr_label: avg_curr,
                "monthly": monthly_avg,
                "monthly_avg": monthly_avg,
                # Key kompatibilitas untuk halaman detil_sco.html (Mobile / Web):
                "NAMA CUSTOMER": prof["name"],
                "AGEN ID": aid,
                "NAMA SCO": disp_sco,
                "CABANG": cabang,
                "JADWAL": prof["jadwal"],
                "LOCATION": prof["location"],
                "LIMIT": prof["limit"],
                "STATUS": prof["status"]
            }
            tren_agen_rows.append(row_data)

    tren_agen_rows.sort(key=lambda x: x["avg_curr"], reverse=True)

    # 3. EXTRACT KPI_SCO & KPI_DSO
    kpi_sco_json = []
    kpi_dso_json = []
    kpi_file_to_read = KPI_EXCEL_PATH if os.path.exists(KPI_EXCEL_PATH) else os.path.join(SCO_DIR, "KPI_SCO.xls")
    if os.path.exists(kpi_file_to_read):
        try:
            import openpyxl
            wb_kpi = openpyxl.load_workbook(kpi_file_to_read, data_only=True)

            def _safe_float(v):
                if v is None or v == "": return 0.0
                try:
                    return float(str(v).replace(",", "."))
                except Exception:
                    return 0.0

            def _safe_pct(v):
                val = _safe_float(v)
                return val * 100.0 if abs(val) <= 2.0 and val != 0 else val

            # --- A. KPI_SCO ---
            if 'KPI_SCO' in wb_kpi.sheetnames:
                ws_kpi = wb_kpi['KPI_SCO']
                kpi_rows = list(ws_kpi.iter_rows(values_only=True))
                if len(kpi_rows) > 1:
                    for r in kpi_rows[1:]:
                        nama = str(r[1] or "").strip()
                        if not nama or nama.lower() in ("nama", "total", ""):
                            continue

                        bulan_val = r[0]
                        if isinstance(bulan_val, (datetime.date, datetime.datetime)):
                            bulan_str = bulan_val.strftime("%Y-%m-%d")
                        else:
                            bulan_str = str(bulan_val or "").strip()

                        pjp = int(_safe_float(r[2]))
                        tgt_visit = _safe_float(r[3])
                        ach_visit = _safe_float(r[4])
                        pct_visit = _safe_pct(r[5]) if r[5] is not None else ((ach_visit / tgt_visit * 100.0) if tgt_visit > 0 else 0.0)

                        tgt_coll = _safe_float(r[6])
                        ach_coll = _safe_float(r[7])
                        pct_coll = _safe_pct(r[8]) if r[8] is not None else ((ach_coll / tgt_coll * 100.0) if tgt_coll > 0 else 0.0)

                        tgt_trx = _safe_float(r[9]) if len(r) > 9 else 0.0
                        ach_trx = _safe_float(r[10]) if len(r) > 10 else 0.0
                        pct_trx = _safe_pct(r[11]) if len(r) > 11 and r[11] is not None else ((ach_trx / tgt_trx * 100.0) if tgt_trx > 0 else 0.0)

                        trx_lalu = _safe_float(r[12]) if len(r) > 12 else 0.0
                        trx_ini = _safe_float(r[13]) if len(r) > 13 else 0.0
                        growth = _safe_pct(r[14]) if len(r) > 14 and r[14] is not None else (((trx_ini - trx_lalu) / trx_lalu * 100.0) if trx_lalu > 0 else 0.0)

                        score = _safe_pct(r[15]) if len(r) > 15 and r[15] is not None else 0.0
                        if score == 0.0:
                            score = (pct_visit * 0.15) + (pct_coll * 0.25) + (pct_trx * 0.35) + (growth * 0.25)
                        insentif = _safe_float(r[16]) if len(r) > 16 else 0.0

                        kpi_sco_json.append({
                            "bulan": bulan_str,
                            "nama": nama,
                            "pjp": pjp,
                            "tgt_visit": round(tgt_visit, 0),
                            "ach_visit": round(ach_visit, 0),
                            "pct_visit": round(pct_visit, 1),
                            "tgt_coll": round(tgt_coll, 0),
                            "ach_coll": round(ach_coll, 0),
                            "pct_coll": round(pct_coll, 1),
                            "tgt_trx": round(tgt_trx, 1),
                            "ach_trx": round(ach_trx, 1),
                            "pct_trx": round(pct_trx, 1),
                            "trx_lalu": round(trx_lalu, 1),
                            "trx_ini": round(trx_ini, 1),
                            "growth": round(growth, 1),
                            "score": round(score, 1),
                            "insentif": round(insentif, 0)
                        })

            # --- B. KPI_DSO ---
            if 'KPI_DSO' in wb_kpi.sheetnames:
                ws_dso = wb_kpi['KPI_DSO']
                dso_rows = list(ws_dso.iter_rows(values_only=True))
                if len(dso_rows) > 3:
                    for r in dso_rows[3:]:
                        bulan_val = r[0]
                        if bulan_val is None or str(bulan_val).strip() == "":
                            continue
                        if isinstance(bulan_val, (datetime.date, datetime.datetime)):
                            bulan_str = bulan_val.strftime("%Y-%m-%d")
                        else:
                            bulan_str = str(bulan_val).strip()

                        tgt_new = _safe_float(r[1])
                        ach_new = _safe_float(r[2])
                        pct_new = _safe_pct(r[3]) if r[3] is not None else ((ach_new / tgt_new * 100.0) if tgt_new > 0 else 0.0)

                        tgt_trx = _safe_float(r[4])
                        ach_trx = _safe_float(r[5])
                        pct_trx = _safe_pct(r[6]) if r[6] is not None else ((ach_trx / tgt_trx * 100.0) if tgt_trx > 0 else 0.0)

                        tgt_voc = _safe_float(r[7])
                        ach_voc = _safe_float(r[8])
                        pct_voc = _safe_pct(r[9]) if r[9] is not None else ((ach_voc / tgt_voc * 100.0) if tgt_voc > 0 else 0.0)

                        tgt_prd = _safe_float(r[10])
                        ach_prd = _safe_float(r[11])
                        pct_prd = _safe_pct(r[12]) if r[12] is not None else ((ach_prd / tgt_prd * 100.0) if tgt_prd > 0 else 0.0)

                        score = _safe_pct(r[13]) if len(r) > 13 and r[13] is not None else 0.0
                        if score == 0.0 and (tgt_new > 0 or tgt_trx > 0 or tgt_voc > 0 or tgt_prd > 0):
                            score = (pct_new * 0.3) + (pct_trx * 0.2) + (pct_voc * 0.3) + (pct_prd * 0.2)

                        multiplier = _safe_pct(r[15]) if len(r) > 15 and r[15] is not None else 0.0
                        if multiplier == 0.0 and score > 0:
                            if score >= 120.0:
                                multiplier = 120.0
                            elif score >= 70.0:
                                multiplier = score
                            elif score >= 60.0:
                                multiplier = 50.0
                            else:
                                multiplier = 0.0

                        insentif = _safe_float(r[16]) if len(r) > 16 else 0.0
                        if insentif == 0.0 and multiplier > 0:
                            insentif = ((ach_trx * 31.0) + (ach_voc + ach_prd)) * 50.0 * (multiplier / 100.0)

                        kpi_dso_json.append({
                            "bulan": bulan_str,
                            "nama": "Ahmad Bukhori",
                            "tgt_new_member": round(tgt_new, 0),
                            "ach_new_member": round(ach_new, 0),
                            "pct_new_member": round(pct_new, 1),
                            "tgt_daily_trx": round(tgt_trx, 1),
                            "ach_daily_trx": round(ach_trx, 1),
                            "pct_daily_trx": round(pct_trx, 1),
                            "tgt_voucher": round(tgt_voc, 0),
                            "ach_voucher": round(ach_voc, 0),
                            "pct_voucher": round(pct_voc, 1),
                            "tgt_perdana": round(tgt_prd, 0),
                            "ach_perdana": round(ach_prd, 0),
                            "pct_perdana": round(pct_prd, 1),
                            "score": round(score, 1),
                            "multiplier": round(multiplier, 1),
                            "insentif": round(insentif, 0)
                        })

            wb_kpi.close()
        except Exception as err:
            print(f"[WARN] Error extracting KPI to JSON: {err}")

    # 4. WRITE data_sco.json
    latest_meta = periods.get(latest_m, {})
    cutoff_formatted = latest_meta.get("cutoff_date", "")

    json_payload = {
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "latest_period": latest_m,
        "cutoff_date": cutoff_formatted,
        "periods_list": periods_list,
        "periods": periods,
        "months": {
            "prev": latest_meta.get("prev_name", "Sep"),
            "curr": latest_meta.get("curr_name", "Oct"),
            "days_prev": latest_meta.get("days_prev", 30),
            "days_curr": latest_meta.get("days_curr", 1)
        },
        "index": latest_meta.get("index", []),
        "tren_agen": tren_agen_rows,
        "tren_harian": harian_json_list,
        "kpi_sco": kpi_sco_json,
        "kpi_dso": kpi_dso_json
    }

    os.makedirs(SCO_DIR, exist_ok=True)
    with open(JSON_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(json_payload, f, indent=2, ensure_ascii=False)

    # 4. GENERATE DATA_RESELLER.JSON (Analisa Reseller % EWALLET)
    reseller_result = generate_reseller_data(df_sukses=df_sukses, months=months)

    return {
        "ok": True,
        "generated_at": json_payload["generated_at"],
        "cutoff_date": cutoff_formatted,
        "months": months,
        "latest_period": latest_m,
        "json_file": JSON_OUTPUT,
        "reseller_file": RESELLER_JSON_OUTPUT,
        "agen_count": len(tren_agen_rows),
        "harian_count": len(harian_json_list),
        "kpi_count": len(kpi_sco_json),
        "reseller_count": reseller_result.get("total_resellers", 0)
    }


def generate_reseller_data(df_sukses: pd.DataFrame = None, months: list = None) -> dict:
    r"""
    Kalkulasi Analisa Reseller % EWALLET per bulan dan tren tahunan untuk ASTAGA.
    Output disimpan ke C:\WEB REPORT\pages\sco\data_reseller.json.
    """
    try:
        import engines.product_engine as pe

        p_trx = os.path.join(CACHE_DIR, "trx_astaga_2026.parquet")
        if df_sukses is None:
            if not os.path.exists(p_trx):
                import engines.transaction_engine as te
                te.build_cache("ASTAGA", "2026")
            df_trx = pd.read_parquet(p_trx)
            df_trx = me.filter_astaga_internal(df_trx)
            df_sukses = df_trx[df_trx["status"].astype(str).str.lower().str.contains("sukses", na=False)].copy()
            df_sukses["tgl_dt"] = pd.to_datetime(df_sukses["tgl_entry"])
            df_sukses["MonthCode"] = df_sukses["tgl_dt"].dt.strftime("%m%y")
            df_sukses["ar_id"] = df_sukses["ar_id"].astype(str).str.strip()

        # Load master mapping
        _, _, df_a, df_r = load_master_customers()

        for col in ["Kode Reseller", "Reseller Name", "Group", "Agen id"]:
            if col in df_r.columns:
                df_r[col] = df_r[col].fillna("").astype(str).str.replace("\xa0", " ").str.strip()

        for col in ["AGEN ID", "SCO", "CABANG", "LIMIT"]:
            if col in df_a.columns:
                df_a[col] = df_a[col].fillna("").astype(str).str.replace("\xa0", " ").str.strip()

        # Dict mappings
        member_to_name = dict(zip(df_r["Kode Reseller"], df_r["Reseller Name"]))
        member_to_group = dict(zip(df_r["Kode Reseller"], df_r["Group"]))
        member_to_agen = dict(zip(df_r["Kode Reseller"], df_r["Agen id"]))

        agen_to_sco = {}
        agen_to_cabang = {}
        agen_to_jadwal = {}
        agen_to_limit = {}
        for _, row in df_a.iterrows():
            aid = str(row["AGEN ID"]).strip()
            sco = str(row.get("SCO", "")).strip()
            cab = str(row.get("CABANG", "")).strip()
            jadwal = str(row.get("JADWAL", "")).strip()
            if cab.upper() == "ONLINE" or sco.upper() == "ONLINE":
                agen_to_sco[aid] = "ONLINE"
            elif sco:
                agen_to_sco[aid] = sco
            agen_to_cabang[aid] = cab
            agen_to_jadwal[aid] = jadwal
            try:
                agen_to_limit[aid] = float(row.get("LIMIT", 0))
            except Exception:
                agen_to_limit[aid] = 0.0

        member_to_sco = {m_id: agen_to_sco.get(a_id, "-") for m_id, a_id in member_to_agen.items()}
        member_to_cabang = {m_id: agen_to_cabang.get(a_id, "-") for m_id, a_id in member_to_agen.items()}
        member_to_jadwal = {m_id: agen_to_jadwal.get(a_id, "-") for m_id, a_id in member_to_agen.items()}
        member_to_limit = {m_id: agen_to_limit.get(a_id, 0.0) for m_id, a_id in member_to_agen.items()}

        # Load product categories
        prod_map = pe.get_product_map("ASTAGA")

        # Map Kategori transaksi
        def get_cat(pid):
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

        df_work = df_sukses.copy()
        df_work["Kategori"] = df_work["product_id"].map(get_cat)
        df_work["Group"] = df_work["ar_id"].map(member_to_group).fillna("LAINNYA")
        df_work["Reseller_Name"] = df_work["ar_id"].map(member_to_name).fillna(df_work["ar_id"])

        # Filter exclude groups sesuai standar ASTAGA
        excluded_groups = {"B - Branch", "C - Canvasser", "O - Online", "P - Prima", "PN - Penipuan Fraud"}
        df_work = df_work[~df_work["Group"].isin(excluded_groups)]

        if months is None:
            months = sorted(df_work["MonthCode"].unique().tolist(), key=lambda x: ("20" + x[2:] + x[:2]))

        cats = ["EWALLET", "PPOB", "TELCO", "TOKEN PLN", "TRANSFER STOK", "VOUCHER GAME"]
        monthly_data = {}
        resellers_yearly = {}

        for m_code in months:
            df_m = df_work[df_work["MonthCode"] == m_code]
            if df_m.empty:
                continue

            mm = m_code[:2]
            label_id = BULAN_SHORT_ID.get(mm, mm) + f" 20{m_code[2:]}"

            # Pivot per reseller
            pivot = df_m.pivot_table(
                index=["ar_id", "Reseller_Name", "Group"],
                columns="Kategori",
                values="trx_id",
                aggfunc="count",
                fill_value=0
            )

            for c in cats:
                if c not in pivot.columns:
                    pivot[c] = 0

            pivot = pivot[cats]
            pivot["Grand Total"] = pivot.sum(axis=1)
            pivot["% EWALLET"] = ((pivot["EWALLET"] / pivot["Grand Total"]) * 100).round(1)
            pivot = pivot.sort_values(by="Grand Total", ascending=False)

            m_rows = []
            m_high_ew = 0
            for (kres, rname, grp), r in pivot.iterrows():
                pct = float(r["% EWALLET"])
                if pct >= 50.0:
                    m_high_ew += 1

                row_dict = {
                    "kode": str(kres),
                    "name": str(rname) if str(rname) != "nan" else str(kres),
                    "group": str(grp),
                    "pct_ewallet": pct,
                    "ewallet": int(r["EWALLET"]),
                    "ppob": int(r["PPOB"]),
                    "telco": int(r["TELCO"]),
                    "token_pln": int(r["TOKEN PLN"]),
                    "transfer_stok": int(r["TRANSFER STOK"]),
                    "voucher_game": int(r["VOUCHER GAME"]),
                    "grand_total": int(r["Grand Total"]),
                    "sco": member_to_sco.get(kres, "-"),
                    "cabang": member_to_cabang.get(kres, "-"),
                    "jadwal": member_to_jadwal.get(kres, "-"),
                    "limit": member_to_limit.get(kres, 0.0)
                }
                m_rows.append(row_dict)

                # Accumulate for yearly trend
                if kres not in resellers_yearly:
                    resellers_yearly[kres] = {
                        "kode": str(kres),
                        "name": str(rname) if str(rname) != "nan" else str(kres),
                        "group": str(grp),
                        "sco": member_to_sco.get(kres, "-"),
                        "cabang": member_to_cabang.get(kres, "-"),
                        "jadwal": member_to_jadwal.get(kres, "-"),
                        "limit": member_to_limit.get(kres, 0.0),
                        "total_trx": 0,
                        "total_ewallet": 0,
                        "months": {}
                    }
                resellers_yearly[kres]["total_trx"] += int(r["Grand Total"])
                resellers_yearly[kres]["total_ewallet"] += int(r["EWALLET"])
                resellers_yearly[kres]["months"][mm] = pct

            tot_trx = sum(r["grand_total"] for r in m_rows)
            tot_ew = sum(r["ewallet"] for r in m_rows)
            overall_pct = round((tot_ew / tot_trx * 100), 1) if tot_trx > 0 else 0.0

            monthly_data[m_code] = {
                "period_label": label_id,
                "summary": {
                    "total_resellers": len(m_rows),
                    "total_trx": tot_trx,
                    "total_ewallet": tot_ew,
                    "pct_ewallet": overall_pct,
                    "high_ewallet_count": m_high_ew
                },
                "rows": m_rows
            }

        # Build Yearly Rows
        yearly_rows = []
        for kres, r_info in resellers_yearly.items():
            tot_t = r_info["total_trx"]
            tot_e = r_info["total_ewallet"]
            avg_pct = round((tot_e / tot_t * 100), 1) if tot_t > 0 else 0.0
            r_info["avg_pct_ewallet"] = avg_pct
            yearly_rows.append(r_info)

        yearly_rows.sort(key=lambda x: x["total_trx"], reverse=True)

        # Yearly Monthly Summary
        valid_m_keys = [f"{i:02d}" for i in range(1, 13)]
        yearly_summary = {}
        for m_code, m_obj in monthly_data.items():
            mm = m_code[:2]
            if mm in valid_m_keys:
                s = m_obj["summary"]
                yearly_summary[mm] = {
                    "month_code": m_code,
                    "label": BULAN_SHORT_ID.get(mm, mm),
                    "total_resellers": s["total_resellers"],
                    "total_trx": s["total_trx"],
                    "total_ewallet": s["total_ewallet"],
                    "pct_ewallet": s["pct_ewallet"],
                    "high_ewallet_count": s["high_ewallet_count"]
                }

        output = {
            "latest_month": months[-1] if months else "1026",
            "monthly": monthly_data,
            "yearly": {
                "summary": yearly_summary,
                "rows": yearly_rows
            }
        }

        os.makedirs(SCO_DIR, exist_ok=True)
        with open(RESELLER_JSON_OUTPUT, "w", encoding="utf-8") as f:
            json.dump(output, f, separators=(",", ":"))

        print(f"[SCO] Sukses generate data_reseller.json: {len(yearly_rows)} resellers")
        return {"ok": True, "total_resellers": len(yearly_rows)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[WARN] Error generate_reseller_data: {e}")
        return {"ok": False, "error": str(e)}


def push_to_github():
    """
    Commit dan Push pembaruan data SCO ke:
    1. Repositori GitHub Web Report (origin main).
    2. Repositori Standalone depocell/SCO (https://github.com/depocell/SCO -> depocell.github.io/SCO).
    """
    try:
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        env = os.environ.copy()
        env["GCM_INTERACTIVE"] = "never"

        # 1. Push ke repositori Web Report utama
        subprocess.run(["git", "-C", BASE_DIR, "add", "pages/sco"], capture_output=True, text=True, check=True)
        status_res = subprocess.run(["git", "-C", BASE_DIR, "status", "--porcelain", "pages/sco"], capture_output=True, text=True)
        if status_res.stdout.strip():
            subprocess.run(["git", "-C", BASE_DIR, "commit", "-m", f"chore(sco): auto-update data SCO: {now_str}"], capture_output=True, text=True, check=True)
            subprocess.run(["git", "-C", BASE_DIR, "push", "origin", "main"], capture_output=True, text=True, env=env, timeout=60)

        # 2. Sync dan Push ke depocell/SCO (GitHub Pages)
        target_repo = os.path.join(BASE_DIR, ".cache", "sco_git")
        if not os.path.exists(target_repo):
            os.makedirs(os.path.dirname(target_repo), exist_ok=True)
            subprocess.run(["git", "clone", "https://github.com/depocell/SCO.git", target_repo], capture_output=True, text=True, env=env)
        else:
            subprocess.run(["git", "-C", target_repo, "pull", "origin", "main"], capture_output=True, text=True, env=env)

        subprocess.run(["git", "-C", target_repo, "config", "credential.username", "depocell"], capture_output=True, text=True)

        files_to_sync = [
            "index.html", "app.js", "style.css", "data_sco.json", "data_reseller.json",
            "KPI_SCO.xlsx", "leaflet.js", "leaflet.css", "html2canvas.min.js",
            "logo_myastaga.png", "unnamed.png"
        ]
        import shutil
        for fname in files_to_sync:
            src = os.path.join(SCO_DIR, fname)
            dst = os.path.join(target_repo, fname)
            if os.path.exists(src):
                shutil.copy2(src, dst)

        subprocess.run(["git", "-C", target_repo, "add", "-A"], capture_output=True, text=True)
        sco_status = subprocess.run(["git", "-C", target_repo, "status", "--porcelain"], capture_output=True, text=True)
        
        if sco_status.stdout.strip():
            subprocess.run(["git", "-C", target_repo, "commit", "-m", f"chore: update SCO performance data ({now_str})"], capture_output=True, text=True, env=env)
            push_res = subprocess.run(["git", "-C", target_repo, "push", "origin", "main"], capture_output=True, text=True, env=env, timeout=60)
            if push_res.returncode != 0:
                err_msg = push_res.stderr or push_res.stdout or "Push error ke depocell/SCO"
                return {"ok": False, "error": err_msg}

        return {"ok": True, "message": "Berhasil push data SCO ke GitHub Pages & Web Report!", "timestamp": now_str}
    except Exception as e:
        return {"ok": False, "error": str(e)}


if __name__ == "__main__":
    print("[SCO] Menjalankan generator data SCO dari Parquet...")
    t0 = datetime.datetime.now()
    res = generate_sco_data()
    t1 = datetime.datetime.now()
    dur = (t1 - t0).total_seconds()
    print(f"[SCO] Selesai dalam {dur:.2f} detik!")
    print(f"      File JSON: {res['json_file']}")
    print(f"      Total Agen: {res['agen_count']}, Total Harian: {res['harian_count']}, Cutoff: {res['cutoff_date']}")
