"""
fisik_engine.py
Membaca dan memproses laporan rekapan penjualan SISCOM (file .xls / .xlsx / .ttx di pages/fisik/)
Menyediakan breakdown:
- Produk Fisik Murni (Deposit Saldo di-takeout mutlak)
- Breakdown per Cabang / Depo
- Breakdown per Channel / Sales (DSO BIM, Sales Canvasser, Walk In, Transfer)
- Breakdown per Operator & Kategori Produk
- Ranking Produk Terlaris
"""

import os
import glob
import re
from collections import defaultdict
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
FISIK_DIR = os.path.join(BASE_DIR, "pages", "fisik")

MONTH_NAMES = {
    "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
    "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
    "09": "September", "10": "Oktober", "11": "November", "12": "Desember"
}


def get_available_periods():
    """
    Daftar periode file Excel (.xls, .xlsx) atau teks (.ttx) yang ada di folder pages/fisik/
    Contoh: '0726.xls' -> {'code': '0726', 'label': 'Juli 2026', 'filename': '0726.xls'}
    """
    all_files = glob.glob(os.path.join(FISIK_DIR, "*.*"))
    valid_exts = [".xls", ".xlsx", ".ttx"]
    
    # Kelompokkan berdasarkan code (misal 0726, 0826, 0926)
    period_map = {}

    for f in all_files:
        ext = os.path.splitext(f)[1].lower()
        if ext not in valid_exts:
            continue
        fname = os.path.basename(f)
        code = os.path.splitext(fname)[0].split("_")[0]  # buang suffix jika ada
        
        # Format label
        label = code
        if len(code) == 4 and code.isdigit():
            mm = code[:2]
            yy = "20" + code[2:]
            m_label = MONTH_NAMES.get(mm, f"Bulan {mm}")
            label = f"{m_label} {yy}"

        # Prioritas: .xlsx > .xls > .ttx
        if code not in period_map or ext in [".xlsx", ".xls"]:
            period_map[code] = {
                "code": code,
                "label": label,
                "filename": fname,
                "path": f
            }

    periods = list(period_map.values())
    periods.sort(key=lambda x: x["code"], reverse=True)
    return periods


def _parse_num(val):
    if val is None or pd.isna(val):
        return 0.0
    try:
        return float(str(val).replace(",", "").strip())
    except Exception:
        return 0.0


def _detect_operator(prod_name):
    pn = str(prod_name).upper()
    if any(k in pn for k in ["ISAT", "INDOSAT", "IM3", "OREDOO", "MOBO"]):
        return "INDOSAT"
    if any(k in pn for k in ["SIMPATI", "TELKOMSEL", "AS "]):
        return "TELKOMSEL"
    if any(k in pn for k in ["AXIS", "AIGO"]):
        return "AXIS"
    if any(k in pn for k in ["XL"]):
        return "XL"
    if any(k in pn for k in ["THREE", "TRI"]):
        return "TRI"
    if any(k in pn for k in ["SMART", "SMARTFREN"]):
        return "SMARTFREN"
    if any(k in pn for k in ["GTECH", "MODEM"]):
        return "AKSESORIS"
    if "DEPOSIT" in pn:
        return "DEPOSIT/SALDO"
    return "LAINNYA"


def _detect_type(prod_name):
    pn = str(prod_name).upper()
    if "DEPOSIT" in pn:
        return "DEPOSIT"
    if pn.startswith("VOUCHER") or pn.startswith("V."):
        return "VOUCHER"
    if pn.startswith("PERDANA") or pn.startswith("P."):
        return "PERDANA"
    if any(k in pn for k in ["GTECH", "MODEM"]):
        return "HARDWARE"
    return "LAINNYA"


def _parse_excel(target_file):
    """
    Parser robust untuk file Excel SISCOM (.xls / .xlsx) dengan engine calamine atau openpyxl.
    Mendukung format multi-kolom (0826, 0926) maupun 3-kolom (0726).
    """
    try:
        df = pd.read_excel(target_file, engine="calamine", header=None)
    except Exception:
        df = pd.read_excel(target_file, header=None)

    date_range = ""
    # Deteksi range tanggal jika ada di 10 baris pertama
    for r in range(min(10, len(df))):
        for val in df.iloc[r]:
            sval = str(val).strip()
            if "/" in sval and "-" in sval and len(sval) >= 15:
                date_range = sval
                break

    rows = []
    cur_branch = "UNKNOWN"
    cur_channel = "UNKNOWN"
    is_wide_layout = df.shape[1] >= 15

    for r in range(len(df)):
        row = df.iloc[r]
        if is_wide_layout:
            c0 = str(row[0]).strip() if pd.notna(row[0]) else ""
            c3 = str(row[3]).strip() if pd.notna(row[3]) else ""
            c4 = str(row[4]).strip() if pd.notna(row[4]) else ""
            q_val = row[9] if pd.notna(row[9]) else 0
            g_val = row[10] if pd.notna(row[10]) else 0
            d_val = row[12] if pd.notna(row[12]) else 0
            n_val = row[16] if pd.notna(row[16]) else 0

            if "Grand Total" in c0 or "Grand Total" in c3:
                break

            # Abaikan baris header halaman berulang (Page break headers)
            c1 = str(row[1]).strip() if pd.notna(row[1]) else ""
            if any(k in c1.upper() for k in ["PT. DEPO", "REKAPITULASI"]) or "PAGE" in str(row[15]).upper():
                continue
            if c0 == "No." or c3 == "Perincian":
                continue

            # Baris Cabang: c0 ada nomor cabang (1, 2, ...) dan c3 ada teks nama cabang
            if c0.replace(".0", "").isdigit() and c3:
                cur_branch = c3
                cur_channel = "UNKNOWN"
                continue

            # Baris Channel: c3 ada teks nama channel (WALK IN, DSO BIM, SALES, TRANSFER) dan c4 kosong
            if c3 and not c4:
                # Pastikan bukan baris tanggal atau string paging
                if not any(k in c3.upper() for k in ["PT. DEPO", "REKAPITULASI", "PAGE", "PERINCIAN"]):
                    cur_channel = c3
                    continue

            # Baris Item Produk: c4 ada nama produk
            if c4:
                prod_name = c4
                if "DEPOSIT" in prod_name.upper():
                    continue

                qty = _parse_num(q_val)
                gross = _parse_num(g_val)
                diskon = _parse_num(d_val)
                netto = _parse_num(n_val)

                ch_upper = cur_channel.upper()
                if "DSO" in ch_upper or "SALES" in ch_upper:
                    channel_group = "SALES_LAPANGAN"
                elif "WALK IN" in ch_upper:
                    channel_group = "WALK_IN"
                elif "TRANSFER" in ch_upper:
                    channel_group = "TRANSFER"
                else:
                    channel_group = "LAINNYA"

                rows.append({
                    "cabang": cur_branch,
                    "channel": cur_channel,
                    "channel_group": channel_group,
                    "produk": prod_name,
                    "operator": _detect_operator(prod_name),
                    "tipe": _detect_type(prod_name),
                    "qty": qty,
                    "gross": gross,
                    "diskon": diskon,
                    "netto": netto
                })
        else:
            # 3-Kolom Layout (contoh: 0726.xls)
            c0 = str(row[0]).strip() if pd.notna(row[0]) else ""
            c1 = str(row[1]).strip() if pd.notna(row[1]) else ""
            c2 = str(row[2]).strip() if pd.notna(row[2]) else ""

            if "Grand Total" in c0:
                break
            if c0 == "No.":
                continue

            # Cek cabang: c0 digit dan c1 nama depo/cabang
            if c0.replace(".0", "").isdigit() and any(k in c1.upper() for k in ["DEPO", "DMS"]):
                cur_branch = c1
                cur_channel = "UNKNOWN"
                continue

            # Cek channel: c0 nama channel (WALK IN, DSO BIM, TRANSFER, SALES)
            if any(k in c0.upper() for k in ["WALK IN", "DSO", "SALES", "TRANSFER"]) and not any(
                c0.upper().startswith(k) for k in ["VOUCHER", "PERDANA", "P.", "V.", "GTECH", "MODEM"]
            ):
                cur_channel = c0
                continue

            # Cek item produk
            if c0 and c1:
                prod_name = c0
                if "DEPOSIT" in prod_name.upper():
                    continue

                qty = _parse_num(c1)
                netto = _parse_num(c2)

                ch_upper = cur_channel.upper()
                if "DSO" in ch_upper or "SALES" in ch_upper:
                    channel_group = "SALES_LAPANGAN"
                elif "WALK IN" in ch_upper:
                    channel_group = "WALK_IN"
                elif "TRANSFER" in ch_upper:
                    channel_group = "TRANSFER"
                else:
                    channel_group = "LAINNYA"

                rows.append({
                    "cabang": cur_branch,
                    "channel": cur_channel,
                    "channel_group": channel_group,
                    "produk": prod_name,
                    "operator": _detect_operator(prod_name),
                    "tipe": _detect_type(prod_name),
                    "qty": qty,
                    "gross": netto,
                    "diskon": 0.0,
                    "netto": netto
                })

    return date_range, rows


def _parse_ttx(target_file):
    """
    Parser untuk file tab-delimited .ttx (legacy fallback)
    """
    with open(target_file, "rb") as f:
        content = f.read().replace(b"\x00", b"").decode("utf-8", errors="ignore")

    lines = [l.strip() for l in content.splitlines() if l.strip()]
    date_range = ""
    cur_branch = "UNKNOWN"
    cur_channel = "UNKNOWN"
    rows = []

    for l in lines:
        if re.search(r"\d{2}/\d{2}/\d{4}\s*-\s*\d{2}/\d{2}/\d{4}", l):
            date_range = l.strip('" ')
            continue
        if "Grand Total" in l:
            break

        parts = [p.strip().strip('"') for p in l.split("\t")]
        if not parts or len(parts) < 2:
            continue

        if parts[0].isdigit() and len(parts) >= 3:
            cur_branch = parts[1]
            cur_channel = "UNKNOWN"
            continue

        p0 = parts[0]
        is_channel = any(k in p0 for k in ["WALK IN", "DSO", "SALES", "TRANSFER"])
        is_product_prefix = any(p0.startswith(k) for k in ["VOUCHER", "PERDANA", "P.", "V.", "GTECH", "MODEM", "DEPOSIT"])

        if is_channel and not is_product_prefix:
            cur_channel = p0
            continue

        prod_name = parts[1] if parts[0].isdigit() else parts[0]
        if "DEPOSIT" in prod_name.upper():
            continue

        qty_str = parts[2] if parts[0].isdigit() else parts[1]
        gross_str = parts[3] if parts[0].isdigit() and len(parts) > 3 else (parts[2] if len(parts) > 2 else "0")
        diskon_str = parts[4] if len(parts) > 4 else "0"
        netto_str = parts[-1]

        qty = _parse_num(qty_str)
        gross = _parse_num(gross_str)
        diskon = _parse_num(diskon_str)
        netto = _parse_num(netto_str)

        ch_upper = cur_channel.upper()
        if "DSO" in ch_upper or "SALES" in ch_upper:
            channel_group = "SALES_LAPANGAN"
        elif "WALK IN" in ch_upper:
            channel_group = "WALK_IN"
        elif "TRANSFER" in ch_upper:
            channel_group = "TRANSFER"
        else:
            channel_group = "LAINNYA"

        rows.append({
            "cabang": cur_branch,
            "channel": cur_channel,
            "channel_group": channel_group,
            "produk": prod_name,
            "operator": _detect_operator(prod_name),
            "tipe": _detect_type(prod_name),
            "qty": qty,
            "gross": gross,
            "diskon": diskon,
            "netto": netto
        })

    return date_range, rows


_LOAD_CACHE = {}

def load_fisik_data(period_code=None):
    """
    Parse data fisik dari file yang aktif (.xls / .xlsx / .ttx) dengan memory cache.
    Mendukung period_code="ALL" untuk menggabungkan seluruh periode.
    """
    periods = get_available_periods()
    if not periods:
        return {"ok": False, "error": "Tidak ada file .xls / .xlsx / .ttx di folder pages/fisik"}

    if str(period_code).upper() == "ALL":
        all_rows = []
        for p in periods:
            sub = load_fisik_data(p["code"])
            if sub.get("ok"):
                for r in sub.get("rows", []):
                    r_copy = dict(r)
                    r_copy["period_code"] = p["code"]
                    r_copy["period_label"] = p["label"]
                    all_rows.append(r_copy)

        chrono = sorted(periods, key=lambda x: (x["code"][2:], x["code"][:2]))
        date_range = f"Januari - {chrono[-1]['label']}"
        return {
            "ok": True,
            "period_code": "ALL",
            "available_periods": periods,
            "title": "Rekapitulasi Penjualan (Semua Periode)",
            "date_range": date_range,
            "total_records": len(all_rows),
            "rows": all_rows
        }

    if not period_code:
        period_code = periods[0]["code"]

    target_info = next((p for p in periods if p["code"] == period_code), periods[0])
    target_file = target_info["path"]
    period_code = target_info["code"]

    mtime = os.path.getmtime(target_file) if os.path.exists(target_file) else 0
    cache_key = (period_code, target_file, mtime)
    if cache_key in _LOAD_CACHE:
        return _LOAD_CACHE[cache_key]

    ext = os.path.splitext(target_file)[1].lower()
    if ext in [".xls", ".xlsx"]:
        date_range, rows = _parse_excel(target_file)
    else:
        date_range, rows = _parse_ttx(target_file)

    if not date_range and len(period_code) == 4 and period_code.isdigit():
        mm = period_code[:2]
        yy = "20" + period_code[2:]
        m_label = MONTH_NAMES.get(mm, f"Bulan {mm}")
        date_range = f"Periode {m_label} {yy}"

    p_label = target_info.get("label", period_code)
    for r in rows:
        r["period_code"] = period_code
        r["period_label"] = p_label

    res = {
        "ok": True,
        "period_code": period_code,
        "available_periods": periods,
        "title": "Rekapitulasi Penjualan",
        "date_range": date_range,
        "total_records": len(rows),
        "rows": rows
    }
    _LOAD_CACHE[cache_key] = res
    return res


def get_monthly_trend():
    """
    Kompilasi ringkasan tren bulanan tanpa filter untuk visualisasi grafik.
    """
    periods = get_available_periods()
    chronological = sorted(periods, key=lambda x: (x["code"][2:], x["code"][:2]))

    trend_list = []
    for p in chronological:
        p_data = load_fisik_data(p["code"])
        if not p_data.get("ok"):
            continue
        rows = p_data["rows"]
        tot_netto = sum(r["netto"] for r in rows)
        tot_qty = sum(r["qty"] for r in rows)

        # Rincian per kelompok
        bim_rows = [r for r in rows if r["channel"] == "DSO BIM"]
        bim_netto = sum(r["netto"] for r in bim_rows)
        bim_qty = sum(r["qty"] for r in bim_rows)

        walkin_rows = [r for r in rows if r["channel_group"] == "WALK_IN"]
        walkin_netto = sum(r["netto"] for r in walkin_rows)

        transfer_rows = [r for r in rows if r["channel_group"] == "TRANSFER"]
        transfer_netto = sum(r["netto"] for r in transfer_rows)

        # Voucher vs Perdana
        vcr_rows = [r for r in rows if r["tipe"] == "VOUCHER"]
        prd_rows = [r for r in rows if r["tipe"] == "PERDANA"]

        trend_list.append({
            "code": p["code"],
            "label": p["label"],
            "total_netto": tot_netto,
            "total_qty": tot_qty,
            "dso_bim_netto": bim_netto,
            "dso_bim_qty": bim_qty,
            "walkin_netto": walkin_netto,
            "transfer_netto": transfer_netto,
            "voucher_netto": sum(r["netto"] for r in vcr_rows),
            "perdana_netto": sum(r["netto"] for r in prd_rows)
        })

    return trend_list


def get_filtered_monthly_trend(cabang_filter="ALL", channel_filter="ALL", kategori_filter="ALL"):
    """
    Kompilasi ringkasan tren bulanan yang disaring sesuai filter aktif
    (Cabang, Channel, Kategori) untuk visualisasi chart dinamis.
    """
    periods = get_available_periods()
    chronological = sorted(periods, key=lambda x: (x["code"][2:], x["code"][:2]))

    trend_list = []
    for p in chronological:
        p_data = load_fisik_data(p["code"])
        if not p_data.get("ok"):
            continue
        rows = p_data["rows"]

        if cabang_filter != "ALL":
            rows = [r for r in rows if r["cabang"] == cabang_filter]
        if channel_filter != "ALL":
            rows = [r for r in rows if r["channel"] == channel_filter]
        if kategori_filter != "ALL":
            rows = [r for r in rows if r["tipe"] == kategori_filter]

        tot_netto = sum(r["netto"] for r in rows)
        tot_qty = sum(r["qty"] for r in rows)

        trend_list.append({
            "code": p["code"],
            "label": p["label"],
            "netto": tot_netto,
            "qty": tot_qty
        })

    return trend_list


def get_fisik_dashboard(period_code=None, channel_filter="ALL", cabang_filter="ALL", kategori_filter="ALL"):
    """
    Kompilasi ringkasan dan tabel untuk Dashboard Produk Fisik & Sales DSO.
    Deposit sudah di-takeout mutlak.
    """
    raw = load_fisik_data(period_code)
    if not raw.get("ok"):
        return raw

    all_rows = raw["rows"]
    active_rows = all_rows

    # Filter Cabang
    if cabang_filter != "ALL":
        active_rows = [r for r in active_rows if r["cabang"] == cabang_filter]

    # Filter Channel
    if channel_filter != "ALL":
        active_rows = [r for r in active_rows if r["channel"] == channel_filter]

    # Filter Kategori Barang (Tipe: VOUCHER, PERDANA, HARDWARE, LAINNYA)
    if kategori_filter != "ALL":
        active_rows = [r for r in active_rows if r["tipe"] == kategori_filter]

    # 1. KPI Metrik Utama (Fisik Murni)
    total_fisik_qty = sum(r["qty"] for r in active_rows)
    total_fisik_netto = sum(r["netto"] for r in active_rows)

    sales_rows = [r for r in active_rows if r["channel_group"] == "SALES_LAPANGAN"]
    sales_qty = sum(r["qty"] for r in sales_rows)
    sales_netto = sum(r["netto"] for r in sales_rows)

    walkin_rows = [r for r in active_rows if r["channel_group"] == "WALK_IN"]
    walkin_qty = sum(r["qty"] for r in walkin_rows)
    walkin_netto = sum(r["netto"] for r in walkin_rows)

    transfer_rows = [r for r in active_rows if r["channel_group"] == "TRANSFER"]
    transfer_qty = sum(r["qty"] for r in transfer_rows)
    transfer_netto = sum(r["netto"] for r in transfer_rows)

    # 2. Ringkasan per Channel / Sales Person
    by_channel = defaultdict(lambda: {"qty": 0.0, "netto": 0.0, "gross": 0.0, "items": 0, "cabang_list": set(), "group": ""})
    for r in active_rows:
        ch = r["channel"]
        by_channel[ch]["qty"] += r["qty"]
        by_channel[ch]["netto"] += r["netto"]
        by_channel[ch]["gross"] += r["gross"]
        by_channel[ch]["items"] += 1
        by_channel[ch]["cabang_list"].add(r["cabang"])
        by_channel[ch]["group"] = r["channel_group"]

    channel_list = []
    for ch, v in by_channel.items():
        channel_list.append({
            "channel": ch,
            "group": v["group"],
            "cabang": ", ".join(sorted(list(v["cabang_list"]))),
            "items": v["items"],
            "qty": v["qty"],
            "netto": v["netto"],
            "gross": v["gross"]
        })
    channel_list.sort(key=lambda x: x["netto"], reverse=True)

    # 3. Ringkasan per Cabang
    by_cabang = defaultdict(lambda: {"qty": 0.0, "netto": 0.0, "items": 0, "sales_qty": 0.0, "sales_netto": 0.0})
    for r in active_rows:
        cb = r["cabang"]
        by_cabang[cb]["qty"] += r["qty"]
        by_cabang[cb]["netto"] += r["netto"]
        by_cabang[cb]["items"] += 1
        if r["channel_group"] == "SALES_LAPANGAN":
            by_cabang[cb]["sales_qty"] += r["qty"]
            by_cabang[cb]["sales_netto"] += r["netto"]

    cabang_list = []
    for cb, v in by_cabang.items():
        cabang_list.append({
            "cabang": cb,
            "items": v["items"],
            "qty": v["qty"],
            "netto": v["netto"],
            "sales_qty": v["sales_qty"],
            "sales_netto": v["sales_netto"]
        })
    cabang_list.sort(key=lambda x: x["netto"], reverse=True)

    # 4. Ringkasan per Operator (Telco)
    by_operator = defaultdict(lambda: {"qty": 0.0, "netto": 0.0, "items": 0})
    for r in active_rows:
        op = r["operator"]
        by_operator[op]["qty"] += r["qty"]
        by_operator[op]["netto"] += r["netto"]
        by_operator[op]["items"] += 1

    operator_list = []
    for op, v in by_operator.items():
        operator_list.append({
            "operator": op,
            "items": v["items"],
            "qty": v["qty"],
            "netto": v["netto"]
        })
    operator_list.sort(key=lambda x: x["netto"], reverse=True)

    # 5. Ranking Produk Terlaris
    by_product = defaultdict(lambda: {"qty": 0.0, "netto": 0.0, "operator": "", "tipe": "", "channels": set()})
    for r in active_rows:
        p = r["produk"]
        by_product[p]["qty"] += r["qty"]
        by_product[p]["netto"] += r["netto"]
        by_product[p]["operator"] = r["operator"]
        by_product[p]["tipe"] = r["tipe"]
        by_product[p]["channels"].add(r["channel"])

    product_list = []
    for p, v in by_product.items():
        product_list.append({
            "produk": p,
            "operator": v["operator"],
            "tipe": v["tipe"],
            "qty": v["qty"],
            "netto": v["netto"],
            "channel_count": len(v["channels"])
        })
    product_list.sort(key=lambda x: x["netto"], reverse=True)

    # Opsi filter unik untuk UI (ambil master list dari semua periode agar dropdown stabil)
    all_known_branches = set()
    all_known_channels = set()
    all_known_categories = set()
    for p in raw["available_periods"]:
        sub_cached = load_fisik_data(p["code"])
        if sub_cached.get("ok"):
            for r in sub_cached.get("rows", []):
                if r.get("cabang") and r["cabang"] != "UNKNOWN": all_known_branches.add(r["cabang"])
                if r.get("channel") and r["channel"] != "UNKNOWN": all_known_channels.add(r["channel"])
                if r.get("tipe") and r["tipe"] != "UNKNOWN": all_known_categories.add(r["tipe"])

    unique_branches = sorted(list(all_known_branches))
    unique_channels = sorted(list(all_known_channels))
    unique_categories = sorted(list(all_known_categories))

    return {
        "ok": True,
        "period_code": raw["period_code"],
        "available_periods": raw["available_periods"],
        "date_range": raw["date_range"],
        "kpi": {
            "total_fisik_qty": total_fisik_qty,
            "total_fisik_netto": total_fisik_netto,
            "sales_qty": sales_qty,
            "sales_netto": sales_netto,
            "sales_ratio": round((sales_netto / total_fisik_netto * 100), 1) if total_fisik_netto > 0 else 0,
            "walkin_qty": walkin_qty,
            "walkin_netto": walkin_netto,
            "transfer_qty": transfer_qty,
            "transfer_netto": transfer_netto,
        },
        "filters": {
            "branches": unique_branches,
            "channels": unique_channels,
            "categories": unique_categories
        },
        "summary": {
            "channels": channel_list,
            "branches": cabang_list,
            "operators": operator_list,
            "top_products": product_list[:50]
        },
        "monthly_trend": get_monthly_trend(),
        "filtered_monthly_trend": get_filtered_monthly_trend(cabang_filter, channel_filter, kategori_filter),
        "raw_rows": active_rows
    }
