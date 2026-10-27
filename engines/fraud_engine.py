"""

engines/fraud_engine.py — Engine Analisa Fraud & Self-Transaction Reseller (Gestun E-Wallet)

--------------------------------------------------------------------------------------------

Mendeteksi reseller fisik (under SCO & non-Prima) yang melakukan transaksi top-up e-wallet

ke nomor mereka sendiri (nomor HP yang terdaftar di master database).

Modus operandi: Indikasi penarikan dana / withdrawal saldo limit kredit ke rekening pribadi.

"""



import os

import time

import re

import json

import sqlite3

import pandas as pd

from typing import Dict, Any, List, Optional, Set



import engines.transaction_engine as te

import engines.metrics_engine as me



BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DB_PATH = os.path.join(BASE_DIR, "MASTER", "master_data.db")





def get_db_connection() -> sqlite3.Connection:

    conn = sqlite3.connect(DB_PATH)

    conn.row_factory = sqlite3.Row

    return conn





def clean_phone_number(raw_val: Any) -> Optional[str]:

    """Standarisasi format nomor HP Indonesia ke format murni 628xxxxxxxxxx."""

    if not raw_val:

        return None

    s = str(raw_val).strip()

    # Bersihkan ekstensi WA atau karakter non-numerik

    s = re.sub(r"@\.?c\.us$", "", s, flags=re.IGNORECASE)

    s = s.replace("+", "").replace("-", "").replace(" ", "").replace(".", "")

    s = re.sub(r"[^0-9]", "", s)

    if not s:

        return None

    if s.startswith("08"):

        s = "628" + s[2:]

    elif s.startswith("8"):

        s = "628" + s[1:]

    return s if s.startswith("628") and len(s) >= 10 else None





def get_ewallet_product_codes(brand: str = "ASTAGA") -> Set[str]:

    """Mengambil daftar kode produk kategori EWALLET dari database master produk."""

    conn = get_db_connection()

    cur = conn.cursor()

    cur.execute(

        "SELECT kode_produk FROM products WHERE brand = ? AND UPPER(kategori) = 'EWALLET'",

        (brand.upper(),)

    )

    codes = {row["kode_produk"].strip().upper() for row in cur.fetchall()}

    conn.close()

    return codes





def import_trx_tujuan_from_file(file_path: str, brand: str = "ASTAGA") -> dict:

    """

    Mengimpor file TSV/CSV 2 kolom (TrxID & Tujuan) dari OtomaX ke tabel trx_tujuan di master_data.db.

    """

    if not os.path.exists(file_path):

        return {"ok": False, "error": f"File {file_path} tidak ditemukan"}



    brand = (brand or "ASTAGA").strip().upper()

    try:

        try:

            df = pd.read_csv(file_path, sep="\t", dtype=str)

            if len(df.columns) < 2:

                df = pd.read_csv(file_path, sep=",", dtype=str)

        except Exception:

            df = pd.read_csv(file_path, sep=",", dtype=str)



        id_col = None

        tujuan_col = None



        id_aliases = {"TRXID", "TRX_ID", "TRX ID", "ID", "KODE TRANSAKSI", "KODETRANSAKSI", "ID_TRX", "ID TRX"}

        tujuan_aliases = {"TUJUAN", "NOMOR_TUJUAN", "NOMOR TUJUAN", "NO_TUJUAN", "NO TUJUAN", "MSISDN", "TARGET", "NO HP", "NO_HP", "NOMOR"}



        for col in df.columns:

            c_norm = str(col).strip().upper()

            if c_norm in id_aliases and not id_col:

                id_col = col

            elif c_norm in tujuan_aliases and not tujuan_col:

                tujuan_col = col



        if not id_col or not tujuan_col:

            if len(df.columns) == 2:

                id_col, tujuan_col = df.columns[0], df.columns[1]

            else:

                return {"ok": False, "error": f"Kolom TrxID atau Tujuan tidak terdeteksi di {os.path.basename(file_path)}. Kolom: {list(df.columns)}"}



        df = df[[id_col, tujuan_col]].dropna()

        df[id_col] = pd.to_numeric(df[id_col], errors="coerce")

        df = df.dropna(subset=[id_col])

        df[id_col] = df[id_col].astype("int64")

        df[tujuan_col] = df[tujuan_col].astype(str).str.strip()



        records = [(brand, int(r[id_col]), str(r[tujuan_col])) for _, r in df.iterrows()]



        conn = get_db_connection()

        cur = conn.cursor()

        cur.executemany(

            "INSERT OR REPLACE INTO trx_tujuan (brand, trx_id, tujuan) VALUES (?, ?, ?)",

            records

        )

        conn.commit()

        conn.close()



        return {

            "ok": True,

            "filename": os.path.basename(file_path),

            "rows_imported": len(records)

        }

    except Exception as e:

        return {"ok": False, "error": f"Gagal mengimpor {file_path}: {e}"}





def auto_import_pending_tujuan_files(brand: str = "ASTAGA") -> list:

    r"""Memindai folder C:\DMS RAW DATA\UPSERT HARIAN dan TRANSAKSI untuk file nomor tujuan baru."""

    folders = [

        r"C:\DMS RAW DATA\UPSERT HARIAN",

        r"C:\DMS RAW DATA\TRANSAKSI",

        r"C:\DEPASMYID\TRANSAKSI"

    ]

    imported_summary = []

    for folder in folders:

        if not os.path.exists(folder):

            continue

        for root, _, files in os.walk(folder):

            for fname in files:

                fpath = os.path.join(root, fname)

                if any(k in fname.upper() for k in ["TUJUAN", "TARGET", "MSISDN", "PHONE", "NOMOR"]):

                    res = import_trx_tujuan_from_file(fpath, brand)

                    if res.get("ok"):

                        imported_summary.append(res)

    return imported_summary





def load_tujuan_map_for_trx_ids(trx_ids: list, brand: str = "ASTAGA") -> dict:

    """Mengambil pemetaan trx_id -> tujuan dari database SQLite trx_tujuan."""

    if not trx_ids:

        return {}

    conn = get_db_connection()

    cur = conn.cursor()

    chunk_size = 900

    tujuan_map = {}

    for i in range(0, len(trx_ids), chunk_size):

        chunk = trx_ids[i:i + chunk_size]

        placeholders = ",".join(["?"] * len(chunk))

        cur.execute(

            f"SELECT trx_id, tujuan FROM trx_tujuan WHERE brand = ? AND trx_id IN ({placeholders})",

            [brand.upper()] + chunk

        )

        for row in cur.fetchall():

            tujuan_map[int(row["trx_id"])] = str(row["tujuan"]).strip()

    conn.close()

    return tujuan_map





def get_fraud_target_resellers(brand: str = "ASTAGA") -> Dict[str, Dict[str, Any]]:

    """

    Mengambil seluruh reseller yang memenuhi kriteria:

    1. Berada di bawah Agen Induk yang UNDER SCO (bukan 'NON SCO' dan bukan 'ONLINE').

    2. Tipe Agen Induk BUKAN Prima (yaitu tipe 'Limit' dan 'Non Limit').

    3. Digabungkan dengan data kontak terdaftar dari tabel reseller_contacts.

    """

    conn = get_db_connection()

    cur = conn.cursor()



    # Query master reseller + agen induk binaan SCO non-Prima

    query = """

        SELECT 

            r.kode_reseller,

            r.nama_reseller,

            r.cabang,

            r.grup,

            r.root_agen_id,

            a.nama_agen,

            a.sco,

            a.type AS agent_type,

            a.limit_saldo,

            rc.no_wa,

            rc.no_sms,

            rc.candidate_phones

        FROM resellers r

        INNER JOIN agents a ON r.brand = a.brand AND r.root_agen_id = a.agen_id

        LEFT JOIN reseller_contacts rc ON r.kode_reseller = rc.kode_reseller

        WHERE r.brand = ?

          AND a.type != 'Prima'

          AND a.sco NOT IN ('NON SCO', 'ONLINE')

          AND a.sco IS NOT NULL

          AND TRIM(a.sco) != ''

    """

    cur.execute(query, (brand.upper(),))

    resellers_map = {}



    for row in cur.fetchall():

        rid = row["kode_reseller"].strip().upper()



        # Parse candidate phones

        phones_list = set()

        raw_candidates = row["candidate_phones"]

        if raw_candidates:

            try:

                parsed = json.loads(raw_candidates)

                if isinstance(parsed, list):

                    for p in parsed:

                        cp = clean_phone_number(p)

                        if cp:

                            phones_list.add(cp)

            except Exception:

                pass



        # Tambahkan no_wa & no_sms

        p_wa = clean_phone_number(row["no_wa"])

        if p_wa:

            phones_list.add(p_wa)

        p_sms = clean_phone_number(row["no_sms"])

        if p_sms:

            phones_list.add(p_sms)



        limit_val = int(row["limit_saldo"] or 0)

        # Tampilkan limit positif jika di DB tercatat negatif

        limit_display = abs(limit_val)



        resellers_map[rid] = {

            "kode_reseller": rid,

            "nama_reseller": row["nama_reseller"] or rid,

            "cabang": row["cabang"] or "-",

            "grup": row["grup"] or "-",

            "root_agen_id": row["root_agen_id"] or "-",

            "nama_agen": row["nama_agen"] or row["root_agen_id"] or "-",

            "sco": row["sco"] or "-",

            "agent_type": row["agent_type"] or "Non Limit",

            "limit_saldo": limit_display,

            "registered_phone": row["no_wa"] or row["no_sms"] or (list(phones_list)[0] if phones_list else "-"),

            "candidate_phones": list(phones_list),

            "candidate_phones_set": phones_list

        }



    conn.close()

    return resellers_map





def calculate_fraud_analysis(

    brand: str = "ASTAGA",

    year: str = "2026",

    month_code: Optional[str] = None,

    sco_filter: Optional[str] = None,

    cabang_filter: Optional[str] = None,

    search_q: Optional[str] = None,

    min_hits: int = 1

) -> Dict[str, Any]:

    """

    Kalkulasi penuh deteksi fraud self-transaction e-wallet per reseller.

    """

    brand = (brand or "ASTAGA").strip().upper()

    year = str(year or "2026")



    # 1. Load data reseller target (Under SCO & Bukan Prima)

    target_resellers = get_fraud_target_resellers(brand)

    if not target_resellers:

        return {

            "ok": True,

            "brand": brand,

            "year": year,

            "month": month_code or "-",

            "total_targets": 0,

            "has_tujuan_data": False,

            "summary": {"total_fraud_resellers": 0, "total_self_hits": 0, "total_self_nominal": 0, "avg_self_pct": 0.0},

            "rows": []

        }



    target_ar_ids = set(target_resellers.keys())



    # 2. Load transaksi

    try:

        df = te.load(brand, year)

    except Exception as e:

        return {"ok": False, "error": f"Gagal memuat transaksi {brand} {year}: {e}"}



    if brand == "ASTAGA":

        df = me.filter_astaga_internal(df)



    if "is_sukses" not in df.columns:

        df["is_sukses"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False)

    if "ym" not in df.columns:

        df["ym"] = df["tgl_entry"].dt.strftime("%Y-%m")



    # Filter sukses

    df_sukses = df[df["is_sukses"]].copy()



    # Tentukan bulan

    available_months = sorted([str(m) for m in df_sukses["ym"].dropna().unique().tolist() if str(m).startswith(year)])

    if not available_months:

        return {"ok": False, "error": "Tidak ada data transaksi yang tersedia."}



    if not month_code or month_code not in available_months:

        month_code = available_months[-1]  # Default bulan berjalan (terakhir)



    df_month = df_sukses[df_sukses["ym"] == month_code].copy()



    # 0. Auto-import file tujuan dari C:\DEPASMYID\TRANSAKSI jika ada

    auto_import_pending_tujuan_files(brand)



    # 3. Filter transaksi khusus EWALLET milik reseller target

    ewallet_codes = get_ewallet_product_codes(brand)



    # Filter transaksi reseller target (seluruh kategori produk)

    df_target_trx = df_month[df_month["ar_id"].astype(str).str.strip().str.upper().isin(target_ar_ids)].copy()



    # Hitung total semua transaksi per reseller target

    total_all_summary = {}

    if not df_target_trx.empty:

        for rid, grp in df_target_trx.groupby("ar_id"):

            total_all_summary[str(rid).strip().upper()] = len(grp)



    # Klasifikasi apakah transaksi bertipe ewallet

    is_ew = df_target_trx["product_id"].astype(str).str.strip().str.upper().isin(ewallet_codes)

    df_ew = df_target_trx[is_ew].copy()



    # Cek ketersediaan kolom tujuan dari parquet, dan lengkapi baris yang kosong dari tabel SQLite trx_tujuan!

    if not df_ew.empty:

        if "tujuan" not in df_ew.columns:

            df_ew["tujuan"] = None



        null_mask = df_ew["tujuan"].isna() | (df_ew["tujuan"].astype(str).str.strip() == "") | (df_ew["tujuan"].astype(str).str.lower() == "none")

        if null_mask.any():

            missing_ids = [int(x) for x in df_ew.loc[null_mask, "trx_id"].dropna().unique().tolist()]

            if missing_ids:

                t_map = load_tujuan_map_for_trx_ids(missing_ids, brand)

                if t_map:

                    mapped = df_ew.loc[null_mask, "trx_id"].map(t_map)

                    df_ew.loc[null_mask, "tujuan"] = mapped.fillna(df_ew.loc[null_mask, "tujuan"])



    has_tujuan = bool("tujuan" in df_ew.columns and bool(df_ew["tujuan"].dropna().astype(str).str.strip().ne("").any()))



    # Agregasi total transaksi ewallet & % ewallet per reseller target

    ew_summary = {}

    if not df_ew.empty:

        for rid, grp in df_ew.groupby("ar_id"):

            rid_clean = str(rid).strip().upper()

            all_hits = total_all_summary.get(rid_clean, len(grp))

            ew_hits = len(grp)

            pct_ew = round((ew_hits / all_hits * 100), 1) if all_hits > 0 else 0.0

            ew_summary[rid_clean] = {

                "total_all_hits": int(all_hits),

                "total_ew_hits": int(ew_hits),

                "total_ew_jual": int(grp["jual"].sum()),

                "pct_ewallet": float(pct_ew)

            }



    # 4. Pencocokan Self-Transaction (Nomor Tujuan vs Candidate Phones)

    fraud_results = []

    total_self_hits_all = 0

    total_self_nominal_all = 0



    if has_tujuan and not df_ew.empty:

        # Bersihkan nomor tujuan

        df_ew["clean_tujuan"] = df_ew["tujuan"].apply(clean_phone_number)



        for rid, grp in df_ew.groupby("ar_id"):

            rid_clean = str(rid).strip().upper()

            if rid_clean not in target_resellers:

                continue



            rs_meta = target_resellers[rid_clean]

            registered_phones = rs_meta["candidate_phones_set"]

            if not registered_phones:

                continue



            # Filter baris yang tujuan-nya COCOK dengan nomor HP reseller sendiri

            match_mask = grp["clean_tujuan"].isin(registered_phones)

            match_rows = grp[match_mask]



            self_hits = len(match_rows)

            if self_hits >= min_hits:

                self_nominal = int(match_rows["jual"].sum())

                tot_ew_hits = int(ew_summary.get(rid_clean, {}).get("total_ew_hits", self_hits))

                tot_ew_jual = int(ew_summary.get(rid_clean, {}).get("total_ew_jual", self_nominal))

                tot_all_hits = int(ew_summary.get(rid_clean, {}).get("total_all_hits", tot_ew_hits))

                pct_ewallet = float(ew_summary.get(rid_clean, {}).get("pct_ewallet", 0.0))

                self_pct = float(round((self_hits / tot_ew_hits * 100), 1)) if tot_ew_hits > 0 else 0.0



                # Nomor tujuan yang ditembak

                target_phones = sorted(list(match_rows["clean_tujuan"].dropna().unique()))



                # Top produk ewallet yang ditembak

                top_prods_raw = match_rows["product_id"].value_counts().head(3).to_dict()

                top_prods = {str(k): int(v) for k, v in top_prods_raw.items()}



                total_self_hits_all += self_hits

                total_self_nominal_all += self_nominal



                fraud_results.append({

                    "kode_reseller": rid_clean,

                    "nama_reseller": rs_meta["nama_reseller"],

                    "cabang": rs_meta["cabang"],

                    "grup": rs_meta["grup"],

                    "root_agen_id": rs_meta["root_agen_id"],

                    "nama_agen": rs_meta["nama_agen"],

                    "sco": rs_meta["sco"],

                    "agent_type": rs_meta["agent_type"],

                    "limit_saldo": rs_meta["limit_saldo"],

                    "registered_phone": rs_meta["registered_phone"],

                    "candidate_phones": rs_meta["candidate_phones"],

                    "total_all_hits": tot_all_hits,

                    "total_ew_hits": tot_ew_hits,

                    "total_ew_jual": tot_ew_jual,

                    "pct_ewallet": pct_ewallet,

                    "self_hits": self_hits,

                    "self_nominal": self_nominal,

                    "self_pct": self_pct,

                    "target_phones": target_phones,

                    "top_products": top_prods

                })

    else:

        # Jika belum ada kolom tujuan (sedang ditarik OtomaX),

        # sediakan baseline profiling seluruh reseller target dengan transaksi ewallet-nya

        for rid, meta in target_resellers.items():

            if rid in ew_summary:

                stats = ew_summary[rid]

                fraud_results.append({

                    "kode_reseller": rid,

                    "nama_reseller": meta["nama_reseller"],

                    "cabang": meta["cabang"],

                    "grup": meta["grup"],

                    "root_agen_id": meta["root_agen_id"],

                    "nama_agen": meta["nama_agen"],

                    "sco": meta["sco"],

                    "agent_type": meta["agent_type"],

                    "limit_saldo": meta["limit_saldo"],

                    "registered_phone": meta["registered_phone"],

                    "candidate_phones": meta["candidate_phones"],

                    "total_all_hits": int(stats.get("total_all_hits", stats["total_ew_hits"])),

                    "total_ew_hits": int(stats["total_ew_hits"]),

                    "total_ew_jual": int(stats["total_ew_jual"]),

                    "pct_ewallet": float(stats.get("pct_ewallet", 0.0)),

                    "self_hits": 0,

                    "self_nominal": 0,

                    "self_pct": 0.0,

                    "target_phones": [],

                    "top_products": {}

                })



    # 5. Filter Cabang, SCO, dan Search Query jika diberikan

    filtered_results = fraud_results

    if cabang_filter and cabang_filter != "ALL":

        filtered_results = [r for r in filtered_results if r["cabang"].upper() == cabang_filter.upper()]

    if sco_filter and sco_filter != "ALL":

        filtered_results = [r for r in filtered_results if r["sco"].upper() == sco_filter.upper()]

    if search_q:

        q_lower = search_q.strip().lower()

        filtered_results = [

            r for r in filtered_results if

            q_lower in r["kode_reseller"].lower() or

            q_lower in r["nama_reseller"].lower() or

            q_lower in r["nama_agen"].lower() or

            q_lower in r["registered_phone"].lower() or

            any(q_lower in str(tp).lower() for tp in r["target_phones"])

        ]



    # Urutkan berdasarkan self_nominal terbesar, lalu self_hits

    if has_tujuan:

        filtered_results.sort(key=lambda x: (x["self_nominal"], x["self_hits"]), reverse=True)

    else:

        filtered_results.sort(key=lambda x: (x["total_ew_jual"], x["total_ew_hits"]), reverse=True)



    # Summary

    total_fraud_count = int(len([r for r in filtered_results if r["self_hits"] > 0]))

    avg_pct = float(round(sum(r["self_pct"] for r in filtered_results if r["self_hits"] > 0) / max(1, total_fraud_count), 1))



    return {

        "ok": True,

        "brand": brand,

        "year": year,

        "month": str(month_code),

        "available_months": [str(m) for m in available_months],

        "has_tujuan_data": bool(has_tujuan),

        "total_targets": int(len(target_resellers)),

        "summary": {

            "total_fraud_resellers": int(total_fraud_count),

            "total_self_hits": int(total_self_hits_all),

            "total_self_nominal": int(total_self_nominal_all),

            "avg_self_pct": float(avg_pct)

        },

        "rows": filtered_results

    }





def get_reseller_fraud_detail(

    brand: str = "ASTAGA",

    year: str = "2026",

    month_code: Optional[str] = None,

    kode_reseller: str = ""

) -> Dict[str, Any]:

    """

    Mengambil seluruh baris transaksi individual yang cocok dengan self-transaction

    untuk modal drilldown reseller tertentu.

    """

    brand = (brand or "ASTAGA").strip().upper()

    year = str(year or "2026")

    rid_target = (kode_reseller or "").strip().upper()



    if not rid_target:

        return {"ok": False, "error": "Kode reseller wajib diisi"}



    target_resellers = get_fraud_target_resellers(brand)

    rs_meta = target_resellers.get(rid_target)

    if not rs_meta:

        return {"ok": False, "error": f"Reseller {rid_target} tidak termasuk kriteria target (Under SCO & Bukan Prima)"}



    registered_phones = rs_meta["candidate_phones_set"]



    # Load transaksi

    df = te.load(brand, year)

    if brand == "ASTAGA":

        df = me.filter_astaga_internal(df)



    if "is_sukses" not in df.columns:

        df["is_sukses"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False)

    if "ym" not in df.columns:

        df["ym"] = df["tgl_entry"].dt.strftime("%Y-%m")



    df_sukses = df[df["is_sukses"]].copy()



    available_months = sorted([str(m) for m in df_sukses["ym"].dropna().unique().tolist() if str(m).startswith(year)])

    if not month_code or month_code not in available_months:

        month_code = available_months[-1]



    df_month = df_sukses[(df_sukses["ym"] == month_code) & (df_sukses["ar_id"].astype(str).str.strip().str.upper() == rid_target)].copy()



    ewallet_codes = get_ewallet_product_codes(brand)

    is_ew = df_month["product_id"].astype(str).str.strip().str.upper().isin(ewallet_codes)

    df_ew = df_month[is_ew].copy()



    if not df_ew.empty:

        if "tujuan" not in df_ew.columns:

            df_ew["tujuan"] = None



        null_mask = df_ew["tujuan"].isna() | (df_ew["tujuan"].astype(str).str.strip() == "") | (df_ew["tujuan"].astype(str).str.lower() == "none")

        if null_mask.any():

            missing_ids = [int(x) for x in df_ew.loc[null_mask, "trx_id"].dropna().unique().tolist()]

            if missing_ids:

                t_map = load_tujuan_map_for_trx_ids(missing_ids, brand)

                if t_map:

                    mapped = df_ew.loc[null_mask, "trx_id"].map(t_map)

                    df_ew.loc[null_mask, "tujuan"] = mapped.fillna(df_ew.loc[null_mask, "tujuan"])



    has_tujuan = bool("tujuan" in df_ew.columns and bool(df_ew["tujuan"].dropna().astype(str).str.strip().ne("").any()))



    items = []

    if has_tujuan and not df_ew.empty:

        df_ew["clean_tujuan"] = df_ew["tujuan"].apply(clean_phone_number)

        match_mask = df_ew["clean_tujuan"].isin(registered_phones)

        matched_df = df_ew[match_mask].sort_values(by="tgl_entry", ascending=False)



        for _, row in matched_df.iterrows():

            tgl_str = row["tgl_entry"].strftime("%Y-%m-%d %H:%M:%S") if pd.notna(row["tgl_entry"]) else "-"

            items.append({

                "trx_id": int(row["trx_id"]) if pd.notna(row["trx_id"]) else 0,

                "tgl_entry": tgl_str,

                "product_id": str(row["product_id"]),

                "nomor_tujuan": str(row.get("tujuan", "-")),

                "clean_tujuan": str(row.get("clean_tujuan", "-")),

                "harga_beli": int(row["beli"]) if pd.notna(row["beli"]) else 0,

                "harga_jual": int(row["jual"]) if pd.notna(row["jual"]) else 0,

                "status": str(row.get("status", "Sukses"))

            })



    reseller_clean = {k: v for k, v in rs_meta.items() if k != "candidate_phones_set"}

    reseller_clean["candidate_phones"] = [str(x) for x in reseller_clean.get("candidate_phones", [])]

    reseller_clean["limit_saldo"] = int(reseller_clean.get("limit_saldo", 0))



    tot_month_all = len(df_month)

    tot_month_ew = len(df_ew)

    pct_ew = round((tot_month_ew / tot_month_all * 100), 1) if tot_month_all > 0 else 0.0

    reseller_clean["total_all_hits"] = int(tot_month_all)

    reseller_clean["total_ew_hits"] = int(tot_month_ew)

    reseller_clean["pct_ewallet"] = float(pct_ew)



    return {

        "ok": True,

        "reseller": reseller_clean,

        "month": str(month_code),

        "total_self_hits": int(len(items)),

        "total_self_nominal": int(sum(x["harga_jual"] for x in items)),

        "items": items

    }



# =============================================================================

# TAB 2: TREN % EWALLET TOKO INDUK AGEN TIAP BULAN SELAMA 2026

# =============================================================================



_TREN_EWALLET_CACHE: Dict[str, Any] = {}



def calculate_tren_ewallet_agen(brand: str = "ASTAGA", year: str = "2026", force: bool = False) -> Dict[str, Any]:
    """
    Menghitung tren porsi % EWALLET per Toko Induk Agen khusus yang UNDER SCO untuk tiap bulan sepanjang tahun 2026.
    Kriteria: Hanya agen binaan tim sales SCO (bukan 'NON SCO' dan bukan 'ONLINE').
    Formula: % EWALLET = (Total Trx Hits EWALLET / Total Trx Hits Sukses Seluruh Kategori) * 100
    """
    global _TREN_EWALLET_CACHE
    brand = (brand or "ASTAGA").strip().upper()
    year = str(year or "2026")
    cache_key = f"{brand}_{year}"

    now = time.time()
    if not force and cache_key in _TREN_EWALLET_CACHE:
        cached_time, cached_payload = _TREN_EWALLET_CACHE[cache_key]
        if now - cached_time < 3600:
            return cached_payload

    import engines.reseller_engine as re_eng
    ew_codes = get_ewallet_product_codes(brand)
    reseller_meta, agen_meta = re_eng.load_master_meta(brand)

    if brand == "ASTAGA":
        reseller_meta = {k: v for k, v in reseller_meta.items() if str(k).strip().upper() not in me.EXCLUDED_ASTAGA_ACCOUNTS}
        agen_meta = {k: v for k, v in agen_meta.items() if str(k).strip().upper() not in me.EXCLUDED_ASTAGA_ACCOUNTS}
    elif brand == "OKIPAY":
        reseller_meta = {k: v for k, v in reseller_meta.items() if str(k).strip().upper() not in me.DISBANDED_OKIPAY_SALES}
        agen_meta = {k: v for k, v in agen_meta.items() if str(k).strip().upper() not in me.DISBANDED_OKIPAY_SALES}

    reseller_to_agen = {}
    for rid, rmeta in reseller_meta.items():
        aid = rmeta.get("agen_id")
        reseller_to_agen[rid] = aid if aid else rid

    parts_dir = os.path.join(te.CACHE_DIR, "parts")
    prefix = "OP" if brand == "OKIPAY" else ""
    months_cfg = [
        ("0126", "Jan 26"), ("0226", "Feb 26"), ("0326", "Mar 26"),
        ("0426", "Apr 26"), ("0526", "Mei 26"), ("0626", "Jun 26"),
        ("0726", "Jul 26"), ("0826", "Agu 26"), ("0926", "Sep 26"),
        ("1026", "Okt 26")
    ]

    agen_monthly: Dict[str, Dict[str, float]] = {}
    agen_monthly_counts: Dict[str, Dict[str, tuple]] = {}
    agen_totals: Dict[str, Dict[str, int]] = {}
    server_monthly: Dict[str, Dict[str, Any]] = {}
    valid_months: List[Dict[str, str]] = []

    for m_code, m_label in months_cfg:
        fname = f"{brand.lower()}_{year}_{prefix}{m_code}.parquet"
        fpath = os.path.join(parts_dir, fname)
        if not os.path.exists(fpath):
            continue

        valid_months.append({"code": m_code, "label": m_label})
        df = pd.read_parquet(fpath, columns=["ar_id", "product_id", "status"])
        if brand == "ASTAGA":
            df = me.filter_astaga_internal(df)
        df_sukses = df[df["status"].str.lower().str.contains("sukses", na=False)].copy()

        tot_server_m = len(df_sukses)
        df_sukses["is_ew"] = df_sukses["product_id"].astype(str).str.strip().str.upper().isin(ew_codes)
        ew_server_m = int(df_sukses["is_ew"].sum())
        server_monthly[m_code] = {
            "total": tot_server_m,
            "ew": ew_server_m,
            "pct": round(ew_server_m / tot_server_m * 100, 1) if tot_server_m > 0 else 0.0
        }

        df_sukses["agen_id"] = df_sukses["ar_id"].map(reseller_to_agen).fillna(df_sukses["ar_id"])
        gb = df_sukses.groupby("agen_id").agg(
            tot=("status", "count"),
            ew=("is_ew", "sum")
        )

        agen_monthly[m_code] = {}
        agen_monthly_counts[m_code] = {}
        for aid, r in gb.iterrows():
            aid_str = str(aid).strip()
            t = int(r["tot"])
            e = int(r["ew"])
            pct = round(e / t * 100, 1) if t > 0 else 0.0
            agen_monthly[m_code][aid_str] = pct
            agen_monthly_counts[m_code][aid_str] = (t, e)
            if aid_str not in agen_totals:
                agen_totals[aid_str] = {"tot": 0, "ew": 0}
            agen_totals[aid_str]["tot"] += t
            agen_totals[aid_str]["ew"] += e

    rows = []
    for aid, totals in agen_totals.items():
        if totals["tot"] <= 0:
            continue
        meta = agen_meta.get(aid, {})
        res_meta = reseller_meta.get(aid, {})
        tot_all = totals["tot"]
        tot_ew = totals["ew"]
        avg_pct = round(tot_ew / tot_all * 100, 1) if tot_all > 0 else 0.0

        m_dict = {}
        for vm in valid_months:
            m_code = vm["code"]
            m_dict[m_code] = agen_monthly.get(m_code, {}).get(aid, None)

        nama = meta.get("agen_name") or meta.get("raw_name") or res_meta.get("agen_name") or res_meta.get("name") or aid
        cab = meta.get("cabang") or res_meta.get("cabang") or "-"
        sco = meta.get("sco") or res_meta.get("sco") or "-"
        if str(cab).upper() == "ONLINE" or str(sco).upper() == "ONLINE":
            sco = "ONLINE"

        # FILTER WAJIB: HANYA AGEN UNDER SCO (Bukan NON SCO, bukan ONLINE, bukan kosong / '-')
        sco_clean = str(sco or "").strip().upper()
        if brand == "ASTAGA":
            if not sco or sco_clean in ("NON SCO", "ONLINE", "-", ""):
                continue
        else:
            if not sco or sco_clean in ("NON SCO", "-", ""):
                continue

        a_type = meta.get("type") or res_meta.get("type") or "Non Limit"

        # FILTER WAJIB: TAKEOUT AGEN PRIMA (CASH) - HANYA MONITOR AGEN LIMIT & NON LIMIT UNDER SCO
        if str(a_type).strip().lower() == "prima":
            continue

        lim_val = abs(int(float(meta.get("limit") or res_meta.get("limit") or 0)))

        rows.append({
            "agen_id": aid,
            "nama_agen": nama,
            "cabang": cab,
            "sco": sco,
            "agent_type": a_type,
            "limit_saldo": lim_val,
            "total_hits_2026": tot_all,
            "total_ew_hits_2026": tot_ew,
            "avg_pct_ewallet": avg_pct,
            "months": m_dict
        })

    # Urutkan berdasarkan total transaksi 2026 terbanyak
    rows.sort(key=lambda x: x["total_hits_2026"], reverse=True)

    tot_sco_all = sum(r["total_hits_2026"] for r in rows)
    tot_sco_ew_all = sum(r["total_ew_hits_2026"] for r in rows)
    avg_sco_pct = round(tot_sco_ew_all / tot_sco_all * 100, 1) if tot_sco_all > 0 else 0.0

    # Hitung porsi rata-rata bulanan khusus agen under SCO
    monthly_sco_pct = {}
    for vm in valid_months:
        m_code = vm["code"]
        m_counts = agen_monthly_counts.get(m_code, {})
        m_tot = sum(m_counts.get(r["agen_id"], (0, 0))[0] for r in rows)
        m_ew = sum(m_counts.get(r["agen_id"], (0, 0))[1] for r in rows)
        monthly_sco_pct[m_code] = round(m_ew / m_tot * 100, 1) if m_tot > 0 else 0.0

    all_cabangs = sorted(list(set(r["cabang"] for r in rows if r["cabang"] and r["cabang"] != "-")))
    all_scos = sorted(list(set(r["sco"] for r in rows if r["sco"] and r["sco"] not in ("-", "NON SCO", "ONLINE"))))

    payload = {
        "ok": True,
        "brand": brand,
        "year": year,
        "months": valid_months,
        "summary": {
            "total_agen": len(rows),
            "total_server_hits": tot_sco_all,
            "total_server_ew_hits": tot_sco_ew_all,
            "avg_server_pct_ewallet": avg_sco_pct,
            "latest_month_pct": valid_months and monthly_sco_pct.get(valid_months[-1]["code"], 0.0) or 0.0,
            "high_ew_agen_count": sum(1 for r in rows if r["avg_pct_ewallet"] >= 50.0),
            "monthly_server_pct": monthly_sco_pct
        },
        "all_cabangs": all_cabangs,
        "all_scos": all_scos,
        "rows": rows
    }

    _TREN_EWALLET_CACHE[cache_key] = (now, payload)
    return payload
