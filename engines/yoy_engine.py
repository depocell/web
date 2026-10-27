"""
yoy_engine.py
Engine Year on Year (12 Bulan Terakhir):
Menghasilkan data historis 12 bulan terakhir untuk performa Cabang dan Produk/Operator.
Zero Card, murni data series untuk Line Chart dengan Data Labels.
"""

import os
import json
from typing import Dict, Any, List
import engines.analisa_engine as ae
import engines.transaction_engine as te
import engines.customer_engine as ce
import engines.metrics_engine as me
import engines.daily_engine as de

CACHE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pages", "yoy", "data_yoy.json")
_YOY_CACHE: Dict[str, Any] = {}


def get_month_labels(months: List[str]) -> List[str]:
    """Konversi list 'YYYY-MM' menjadi label singkat 'Bln YY' (contoh: 'Nov 25', 'Okt 26')."""
    bulan_id = {
        "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
        "05": "Mei", "06": "Jun", "07": "Jul", "08": "Agu",
        "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
    }
    labels = []
    for ym in months:
        y, m = ym.split("-")
        labels.append(f"{bulan_id.get(m, m)} '{y[2:]}")
    return labels


def compute_yoy_dataset(force: bool = False) -> Dict[str, Any]:
    """
    Hitung dataset 12 bulan terakhir untuk ASTAGA dan OKIPAY.
    Menghasilkan data:
      1. Cabang: Daily Trx & Daily Mbr
      2. Kategori: Daily Trx
      3. Operator: Daily Trx
    """
    global _YOY_CACHE
    if not force and _YOY_CACHE:
        return _YOY_CACHE

    # Cek file cache jika ada dan bukan force
    if not force and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                _YOY_CACHE = data
                return data
        except Exception:
            pass

    analisa_ds = ae.get_analisa_dataset()
    result = {"ASTAGA": {}, "OKIPAY": {}, "months": [], "month_labels": []}

    # Tentukan 12 bulan terakhir dari bulan berjalan
    all_months = sorted(list(analisa_ds.get("ASTAGA", {}).keys()))
    months_12 = all_months[-12:] if len(all_months) >= 12 else all_months
    result["months"] = months_12
    result["month_labels"] = get_month_labels(months_12)

    # 1. Hitung untuk ASTAGA
    # Pra-hitung daily members per cabang untuk 2026 dari transaksi riil jika ada
    daily_mem_2026: Dict[str, Dict[str, float]] = {}
    try:
        df26 = te.load("ASTAGA", "2026")
        df26 = me.filter_astaga_internal(df26)
        cabang_map = ce.get_ar_to_cabang("ASTAGA")
        df26["cabang"] = df26["ar_id"].astype(str).map(cabang_map).fillna("UNKNOWN")
        df26["ym"] = df26["tgl_entry"].dt.strftime("%Y-%m")
        df26["date"] = df26["tgl_entry"].dt.date
        suk26 = df26[df26["status"].astype(str).str.lower().str.contains("sukses", na=False)]
        
        gb = suk26.groupby(["ym", "cabang", "date"])["ar_id"].nunique().groupby(["ym", "cabang"]).mean().round(1)
        for (ym_val, cb_val), val in gb.items():
            if ym_val not in daily_mem_2026:
                daily_mem_2026[ym_val] = {}
            daily_mem_2026[ym_val][cb_val] = float(val)
    except Exception as e:
        print(f"[YOY Engine] Warning: Failed to precompute exact 2026 daily members: {e}")

    # Definisi Cabang resmi
    astaga_channels = ["BSD", "PP", "ICON", "PRG", "ONLINE"]
    okipay_channels = ["ONLINE", "H2H"]

    # Warna standar per cabang (flat palette)
    branch_colors = {
        "BSD": "#0284c7",     # Sky Blue
        "PP": "#059669",      # Emerald Green
        "ICON": "#d97706",    # Amber
        "PRG": "#7c3aed",     # Purple
        "ONLINE": "#e11d48",  # Rose Red
        "H2H": "#2563eb",     # Royal Blue
        "TOTAL": "#1e293b",   # Slate Dark
    }

    category_colors = {
        "TELCO": "#0284c7",
        "PLN": "#d97706",
        "EWALLET": "#059669",
        "PPOB": "#7c3aed",
        "TRANSFER STOK": "#64748b",
        "GAME": "#ec4899"
    }

    operator_colors = {
        "INDOSAT": "#eab308",
        "TELKOMSEL": "#ef4444",
        "XL - AXIS": "#3b82f6",
        "TRI": "#f97316",
        "SMARTFREN": "#ec4899",
        "TOKEN PLN": "#10b981",
        "DANA": "#06b6d4",
        "GOPAY": "#14b8a6",
        "SHOPEEPAY": "#f43f5e"
    }

    for brand, channels in [("ASTAGA", astaga_channels), ("OKIPAY", okipay_channels)]:
        brand_ds = analisa_ds.get(brand, {})

        # Inisialisasi struktur series
        series_cabang_trx = {ch: [] for ch in channels}
        series_cabang_trx["TOTAL"] = []

        series_cabang_mem = {ch: [] for ch in channels}
        series_cabang_mem["TOTAL"] = []

        series_kategori = {}
        series_operator = {}

        # Dapatkan daftar kategori & operator populer
        top_cats = ["TELCO", "PLN", "EWALLET", "PPOB", "GAME"]
        for cat in top_cats:
            series_kategori[cat] = []

        top_ops = ["INDOSAT", "TELKOMSEL", "XL - AXIS", "TRI", "SMARTFREN", "TOKEN PLN", "DANA", "GOPAY"]
        for op in top_ops:
            series_operator[op] = []

        for ym in months_12:
            m_item = brand_ds.get(ym, {})
            days = m_item.get("days_count") or m_item.get("active_days") or 30
            tot_sukses = m_item.get("trx_sukses", 0)
            tot_daily_trx = round(tot_sukses / days, 1) if days > 0 else 0.0

            # 1. Cabang Daily Trx
            b_map = m_item.get("branches", {})
            b_sum_trx = 0.0
            for ch in channels:
                ch_sukses = b_map.get(ch, 0)
                ch_daily_trx = round(ch_sukses / days, 1) if days > 0 else 0.0
                series_cabang_trx[ch].append(ch_daily_trx)
                b_sum_trx += ch_daily_trx
            series_cabang_trx["TOTAL"].append(round(b_sum_trx, 1))

            # 2. Cabang Daily Mbr
            global_daily_cust = m_item.get("daily_customers") or (tot_daily_trx / 5.5 if tot_daily_trx > 0 else 100)
            if global_daily_cust < 500 and ym.startswith("2025"):
                # Penyesuaian skala historis mock 2025 ke rasio riil
                global_daily_cust = round(global_daily_cust * 9.5, 1)

            tot_mem_sum = 0.0
            for ch in channels:
                if brand == "ASTAGA" and ym in daily_mem_2026 and ch in daily_mem_2026[ym]:
                    mem_val = daily_mem_2026[ym][ch]
                else:
                    # Proporsional terhadap share transaksi cabang
                    ch_trx = b_map.get(ch, 0)
                    ratio = ch_trx / tot_sukses if tot_sukses > 0 else (1.0 / len(channels))
                    mem_val = round(global_daily_cust * ratio, 1)
                series_cabang_mem[ch].append(mem_val)
                tot_mem_sum += mem_val
            series_cabang_mem["TOTAL"].append(round(tot_mem_sum, 1))

            # 3. Kategori Daily Trx
            cat_map = m_item.get("categories", {})
            for cat in top_cats:
                cat_val = cat_map.get(cat, 0)
                series_kategori[cat].append(round(cat_val / days, 1) if days > 0 else 0.0)

            # 4. Operator Daily Trx
            op_perf = m_item.get("operators_perf", {})
            for op in top_ops:
                op_val = 0
                if op in op_perf:
                    item_val = op_perf[op]
                    op_val = item_val.get("trx", 0) if isinstance(item_val, dict) else item_val
                series_operator[op].append(round(op_val / days, 1) if days > 0 else 0.0)

        # Format datasets for Chart.js
        datasets_cabang_trx = []
        for ch in channels + ["TOTAL"]:
            color = branch_colors.get(ch, "#64748b")
            is_tot = (ch == "TOTAL")
            datasets_cabang_trx.append({
                "label": f"Total {brand}" if is_tot else ch,
                "data": series_cabang_trx[ch],
                "borderColor": color,
                "backgroundColor": color,
                "borderWidth": 2.5 if is_tot else 1.8,
                "borderDash": [5, 4] if is_tot else [],
                "tension": 0.25,
                "fill": False,
                "pointRadius": 4,
                "pointHoverRadius": 6
            })

        datasets_cabang_mem = []
        for ch in channels + ["TOTAL"]:
            color = branch_colors.get(ch, "#64748b")
            is_tot = (ch == "TOTAL")
            datasets_cabang_mem.append({
                "label": f"Total Member {brand}" if is_tot else ch,
                "data": series_cabang_mem[ch],
                "borderColor": color,
                "backgroundColor": color,
                "borderWidth": 2.5 if is_tot else 1.8,
                "borderDash": [5, 4] if is_tot else [],
                "tension": 0.25,
                "fill": False,
                "pointRadius": 4,
                "pointHoverRadius": 6
            })

        datasets_kategori = []
        for cat in top_cats:
            color = category_colors.get(cat, "#64748b")
            datasets_kategori.append({
                "label": cat,
                "data": series_kategori[cat],
                "borderColor": color,
                "backgroundColor": color,
                "borderWidth": 2,
                "tension": 0.25,
                "fill": False,
                "pointRadius": 4,
                "pointHoverRadius": 6
            })

        datasets_operator = []
        for op in top_ops:
            color = operator_colors.get(op, "#64748b")
            datasets_operator.append({
                "label": op,
                "data": series_operator[op],
                "borderColor": color,
                "backgroundColor": color,
                "borderWidth": 2,
                "tension": 0.25,
                "fill": False,
                "pointRadius": 4,
                "pointHoverRadius": 6
            })

        result[brand] = {
            "channels": channels,
            "cabang_trx": datasets_cabang_trx,
            "cabang_mem": datasets_cabang_mem,
            "kategori": datasets_kategori,
            "operator": datasets_operator
        }

    # Simpan ke cache file
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
    except Exception as e:
        print(f"[YOY Engine] Error saving cache: {e}")

    _YOY_CACHE = result
    return result


def get_yoy_data(brand: str = "ASTAGA", force: bool = False) -> Dict[str, Any]:
    """Mengambil data YoY untuk brand yang diminta."""
    data = compute_yoy_dataset(force=force)
    brand_data = data.get(brand.upper(), data.get("ASTAGA", {}))
    return {
        "ok": True,
        "brand": brand.upper(),
        "months": data.get("months", []),
        "month_labels": data.get("month_labels", []),
        "data": brand_data
    }
