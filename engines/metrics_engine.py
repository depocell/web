"""
engines/metrics_engine.py
=========================
STANDAR TUNGGAL (SINGLE SOURCE OF TRUTH) PERHITUNGAN METRIK WEB REPORT.

Seluruh AI Agent dan engine di project ini WAJIB menggunakan fungsi-fungsi
dari file ini untuk menjaga konsistensi metrik di semua halaman dan API.

Hukum Bisnis Utama (SOP Wajib GEMINI.md):
1. Daily Trx (Run-rate): total_trx / active_cut_off_days (BUKAN kalender 30 hari).
2. Net Profit Server, Base Price & Net ARPU: (jual - markup) - beli (Markup adalah komisi upline).
3. Speed Telemetry: tgl_stat - tgl_entry (HANYA untuk status SUKSES, 0-86400 detik).
4. Filter Akun Internal ASTAGA: AR00037 dan AR00009 WAJIB di-exclude total.
5. Pemetaan Cabang & Tim Sales (SCO): Cabang ONLINE wajib SCO 'ONLINE'.
6. Klasifikasi Tipe Agen ASTAGA: Tepat 3 tipe ('Limit', 'Non Limit', 'Prima').
"""

from typing import Union, Dict, Any, Tuple
import pandas as pd
import numpy as np

# Akun internal operasional ASTAGA yang wajib di-exclude
EXCLUDED_ASTAGA_ACCOUNTS = {"AR00037", "AR00009", "AR20408"}


def filter_astaga_internal(df: pd.DataFrame) -> pd.DataFrame:
    """
    Menyaring dan membuang transaksi dari akun internal operasional ASTAGA (AR00037, AR00009, & AR20408).
    Akun OKIPAY (OP00037 & OP00009) tetap dipertahankan.
    """
    if df.empty:
        return df

    mask = pd.Series(True, index=df.index)
    for col in ["ar_id", "reseller_id", "kode_reseller", "agen_id"]:
        if col in df.columns:
            mask = mask & (~df[col].astype(str).str.strip().str.upper().isin(EXCLUDED_ASTAGA_ACCOUNTS))
    return df[mask]


def get_active_days(df: pd.DataFrame, date_col: str = "tgl_entry") -> int:
    """
    Menghitung jumlah hari aktif unik dalam DataFrame berdasarkan tanggal transaksi.
    Minimal bernilai 1 untuk menghindari division by zero.
    """
    if df.empty or date_col not in df.columns:
        return 1
    try:
        # Jika bukan datetime, coba parse
        s = df[date_col]
        if not pd.api.types.is_datetime64_any_dtype(s):
            s = pd.to_datetime(s, errors="coerce")
        unique_days = int(s.dt.date.dropna().nunique())
        return max(unique_days, 1)
    except Exception:
        return 1


def calculate_daily_rate(total_trx: Union[int, float], active_days: int) -> float:
    """
    Menghitung run-rate rata-rata transaksi harian (Daily Trx).
    Formula: Total Trx / Active Cut-off Days.
    """
    days = max(int(active_days), 1)
    return round(float(total_trx) / days, 1)


def calculate_daily_growth(daily_curr: float, daily_prev: float) -> Dict[str, float]:
    """
    Menghitung perbandingan pertumbuhan harian MoM (Run-rate Growth).
    Mengembalikan selisih nominal harian dan persentase perubahan.
    """
    d_curr = float(daily_curr or 0.0)
    d_prev = float(daily_prev or 0.0)
    diff = round(d_curr - d_prev, 1)
    if d_prev > 0:
        pct = round(((d_curr - d_prev) / d_prev * 100), 1)
    else:
        pct = 100.0 if d_curr > 0 else 0.0
    return {
        "growth_diff": diff,
        "growth_pct": pct
    }


def calculate_server_base_price(
    jual: Union[float, int, pd.Series],
    markup: Union[float, int, pd.Series] = 0.0
) -> Union[float, pd.Series]:
    """
    Menghitung Harga Jual Dasar Server murni (Net Selling Price):
    Harga Jual Dasar = Harga Jual (kotor) - Markup Upline
    
    Catatan:
    - Di transaksi OtomaX, harga jual tercatat sudah ditambah markup komisi upline.
    - Mengurangkan markup menghasilkan nominal omset bersih yang masuk ke kas server.
    """
    return jual - markup


def calculate_net_profit(
    jual: Union[float, int, pd.Series],
    beli: Union[float, int, pd.Series],
    markup: Union[float, int, pd.Series] = 0.0
) -> Union[float, pd.Series]:
    """
    Menghitung Net Profit Murni Server OtomaX:
    Net Profit Server = (Harga Jual - Markup) - Harga Beli
    
    Catatan:
    - Harga Jual di database transaksi OtomaX sudah termasuk markup komisi upline.
    - Markup adalah hak upline/reseller induk, bukan profit server.
    - Untuk agen langsung cabang: Markup = 0, sehingga Net Profit = Jual - Beli.
    """
    return (jual - markup) - beli


def calculate_margin_pct(
    net_profit: Union[float, int, pd.Series],
    base_price: Union[float, int, pd.Series]
) -> Union[float, pd.Series]:
    """
    Menghitung Margin Laba Bersih Server (%):
    Margin % = (Net Profit Server / Harga Jual Dasar Server) * 100
    
    Mendukung scalar float maupun Pandas Series.
    """
    if isinstance(net_profit, pd.Series) or isinstance(base_price, pd.Series):
        s_np = pd.Series(net_profit, dtype=float)
        s_bp = pd.Series(base_price, dtype=float)
        return pd.Series(np.where(s_bp > 0, np.round((s_np / s_bp) * 100, 2), 0.0), index=s_np.index)
    
    np_val = float(net_profit or 0.0)
    bp_val = float(base_price or 0.0)
    if bp_val > 0:
        return round((np_val / bp_val) * 100, 2)
    return 0.0


def calculate_net_arpu(
    net_revenue: Union[float, int],
    total_trx_sukses: Union[float, int]
) -> float:
    """
    Menghitung Net ARPU (Average Revenue Per Unit / Hit Sukses):
    Net ARPU = Total Net Revenue Server / Total Trx Sukses
    di mana Net Revenue = Sum(Harga Jual - Markup).
    """
    cnt = int(total_trx_sukses or 0)
    if cnt <= 0:
        return 0.0
    return round(float(net_revenue or 0.0) / cnt, 2)


def format_duration_str(seconds: Union[int, float]) -> str:
    """
    Memformat durasi detik ke format standar MM:SS (misal 23 -> '00:23', 75 -> '01:15').
    """
    if seconds is None or np.isnan(seconds) or seconds < 0:
        return "00:00"
    sec_int = int(round(float(seconds)))
    mins = sec_int // 60
    secs = sec_int % 60
    return f"{mins:02d}:{secs:02d}"


def calculate_speed_telemetry(
    df: pd.DataFrame,
    entry_col: str = "tgl_entry",
    stat_col: str = "tgl_stat",
    status_col: str = "status"
) -> Dict[str, Any]:
    """
    Menghitung telemetri kecepatan respon transaksi dan SLA server.
    
    HUKUM TELEMETRI:
    Durasi rata-rata HANYA dihitung dari transaksi yang berstatus SUKSES
    dengan durasi wajar (0 s/d 86400 detik / 24 jam).
    """
    if df.empty or entry_col not in df.columns or stat_col not in df.columns:
        return {
            "total_trx": 0,
            "sukses_trx": 0,
            "success_rate_pct": 0.0,
            "avg_seconds": 0.0,
            "avg_str": "00:00",
            "median_seconds": 0.0,
            "median_str": "00:00",
            "p90_seconds": 0.0,
            "sla_status": "TIDAK ADA DATA"
        }

    total_trx = len(df)
    
    # Filter status SUKSES
    if status_col in df.columns:
        is_sukses = df[status_col].astype(str).str.lower().str.contains("sukses", na=False)
    else:
        is_sukses = pd.Series(True, index=df.index)

    df_sukses = df[is_sukses].copy()
    sukses_trx = len(df_sukses)
    sr_pct = round((sukses_trx / total_trx * 100), 2) if total_trx > 0 else 0.0

    if df_sukses.empty:
        return {
            "total_trx": total_trx,
            "sukses_trx": 0,
            "success_rate_pct": sr_pct,
            "avg_seconds": 0.0,
            "avg_str": "00:00",
            "median_seconds": 0.0,
            "median_str": "00:00",
            "p90_seconds": 0.0,
            "sla_status": "GANGGUAN"
        }

    # Hitung durasi detik
    t_entry = pd.to_datetime(df_sukses[entry_col], errors="coerce")
    t_stat = pd.to_datetime(df_sukses[stat_col], errors="coerce")
    dur_sec = (t_stat - t_entry).dt.total_seconds()

    # Filter anomali durasi (0 s/d 86400 detik)
    valid_dur = dur_sec[(dur_sec >= 0) & (dur_sec <= 86400)].dropna()

    if valid_dur.empty:
        avg_sec = 0.0
        med_sec = 0.0
        p90_sec = 0.0
    else:
        avg_sec = round(float(valid_dur.mean()), 1)
        med_sec = round(float(valid_dur.median()), 1)
        p90_sec = round(float(valid_dur.quantile(0.90)), 1)

    # Klasifikasi SLA
    sla_status = classify_sla_status(sr_pct, avg_sec, naming="PRIMA")

    return {
        "total_trx": total_trx,
        "sukses_trx": sukses_trx,
        "success_rate_pct": sr_pct,
        "avg_seconds": avg_sec,
        "avg_str": format_duration_str(avg_sec),
        "median_seconds": med_sec,
        "median_str": format_duration_str(med_sec),
        "p90_seconds": p90_sec,
        "sla_status": sla_status
    }


def classify_sla_status(
    sukses_pct: float,
    avg_speed_sec: float,
    naming: str = "BAIK"
) -> str:
    """
    Klasifikasi SLA Kesehatan Layanan / Modul sesuai SOP GEMINI.md:
    - Hijau (Optimal): Sukses >= 98.0% DAN Avg Speed < 15.0 detik
    - Merah (Kritis): Sukses < 95.0% ATAU Avg Speed > 30.0 detik
    - Kuning (Waspada): Kondisi di antara hijau dan merah

    naming:
    - "BAIK"  -> Mengembalikan 'BAIK', 'CUKUP', 'KURANG' (Standar BI Web Report)
    - "PRIMA" -> Mengembalikan 'PRIMA', 'WASPADA', 'GANGGUAN' (Standar NOC Server)
    """
    s_pct = float(sukses_pct or 0.0)
    speed = float(avg_speed_sec or 0.0)

    if s_pct < 95.0 or speed > 30.0:
        return "KURANG" if naming.upper() == "BAIK" else "GANGGUAN"
    elif s_pct >= 98.0 and speed < 15.0:
        return "BAIK" if naming.upper() == "BAIK" else "PRIMA"
    else:
        return "CUKUP" if naming.upper() == "BAIK" else "WASPADA"


def classify_astaga_agent_type(
    limit_saldo: Union[float, int],
    cabang: str = "",
    grup: str = "",
    existing_type: str = ""
) -> str:
    """
    Klasifikasi tipe agen resmi brand ASTAGA sesuai Hukum 8 GEMINI.md:
    Hanya ada 3 tipe resmi (DILARANG menggunakan 'Standard' atau nama lain):
    1. 'Limit': limit_saldo != 0 (memiliki plafon kredit aktif)
    2. 'Non Limit': limit_saldo == 0 pada cabang/toko fisik non-prima (ex-limit)
    3. 'Prima': limit_saldo == 0 pada reseller grup 'P' (Prima reguler) atau cabang 'ONLINE'
    """
    lim = float(limit_saldo or 0.0)
    cab = str(cabang or "").strip().upper()
    grp = str(grup or "").strip().upper()
    ex_type = str(existing_type or "").strip()
    if ex_type in ("No Limit", "NON LIMIT"):
        ex_type = "Non Limit"

    if lim != 0:
        return "Limit"
    elif ex_type in ("Limit", "Non Limit", "Prima"):
        return "Non Limit" if ex_type == "Limit" else ex_type
    elif cab == "ONLINE" or grp == "P" or grp.startswith("P -"):
        return "Prima"
    else:
        return "Non Limit"


def normalize_astaga_sco(cabang: str, current_sco: str = "") -> str:
    """
    Normalisasi pemetaan cabang & tim sales (SCO) sesuai Hukum 7 GEMINI.md:
    - Cabang ONLINE: Seluruh agen WAJIB SCO = 'ONLINE' (BUKAN 'NON SCO')
    - Cabang Fisik (BSD, ICON, PP, PRG): NON SCO hanya untuk agen cabang fisik (dilarang SCO = 'ONLINE')
    """
    cab = str(cabang or "").strip().upper()
    sco = str(current_sco or "NON SCO").strip()
    if not sco:
        sco = "NON SCO"

    if cab == "ONLINE":
        return "ONLINE"
    elif sco.upper() == "ONLINE":
        return "NON SCO"
    return sco


def format_limit_saldo(limit_saldo: Union[float, int]) -> str:
    """
    Format limit saldo sesuai Hukum 8 GEMINI.md:
    Di server OtomaX tersimpan negatif (misal -1.000.000), pada UI ditampilkan
    sebagai nilai rupiah positif (misal 'Rp 1.000.000').
    """
    val = abs(float(limit_saldo or 0.0))
    if val == 0:
        return "Rp 0"
    return f"Rp {int(round(val)):,}".replace(",", ".")

