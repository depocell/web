"""
engines/visit_engine.py — Target Kunjungan Sales (SCO) vs Realisasi
-------------------------------------------------------------------
Menganalisis jadwal kunjungan rutin agen (Senin-Kamis, Selasa-Jumat, Rabu-Sabtu)
berdasarkan master data SQLite, memetakan target harian untuk bulan berjalan (November),
dan mencocokkan realisasi kunjungan fisik dari file laporan kunjungan personalia (Excel).
Menghasilkan long-format dataset, skor kepatuhan, matriks harian, dan audit toko terlewat.
"""

import os
import re
import sqlite3
import pandas as pd
import openpyxl
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "MASTER", "master_data.db")
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
SUMMARY_CACHE_FILE = os.path.join(CACHE_DIR, "visit_summary_cache.json")
_CACHED_VISIT_RESULT = None
DEFAULT_EXCEL_PATH = os.path.join(
    BASE_DIR,
    "Laporan Kunjungan Klien Semua Personalia Versi 2 Periode 1 Nov 2026 - 15 Nov 2026 - 1794806282880.xlsx"
)

DAY_TO_JADWAL = {
    'Monday': 'Senin,Kamis',
    'Thursday': 'Senin,Kamis',
    'Tuesday': "Selasa,Jum'at",
    'Friday': "Selasa,Jum'at",
    'Wednesday': 'Rabu,Sabtu',
    'Saturday': 'Rabu,Sabtu'
}

DAY_TO_HARI = {
    'Monday': 'Senin',
    'Tuesday': 'Selasa',
    'Wednesday': 'Rabu',
    'Thursday': 'Kamis',
    'Friday': "Jum'at",
    'Saturday': 'Sabtu',
    'Sunday': 'Minggu'
}

MONTH_MAP = {'Nov': 11, 'Des': 12, 'Oct': 10, 'Sep': 9, 'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'Mei': 5, 'Jun': 6, 'Jul': 7, 'Agu': 8}


def parse_date_str(d_str):
    if not d_str:
        return None
    parts = str(d_str).strip().split()
    if len(parts) == 3:
        try:
            day = int(parts[0])
            m_str = parts[1]
            year = 2000 + int(parts[2]) if len(parts[2]) == 2 else int(parts[2])
            month = MONTH_MAP.get(m_str, 11)
            return f"{year:04d}-{month:02d}-{day:02d}"
        except Exception:
            return None
    return None


def get_target_agents():
    """Mengambil master agen yang memiliki jadwal kunjungan aktif di bawah SCO lapangan."""
    if not os.path.exists(DB_PATH):
        return pd.DataFrame()

    conn = sqlite3.connect(DB_PATH)
    query = """
        SELECT brand, agen_id, nama_agen, cabang, type as tipe_agen, sco, jadwal, is_active
        FROM agents
        WHERE sco IN ('Abdul Harris', 'Febri Kurniawan', 'Hupron', 'Khoirul Anan', 'Mas Komarjaya')
          AND jadwal IN ('Senin,Kamis', "Selasa,Jum'at", 'Rabu,Sabtu')
    """
    df = pd.read_sql_query(query, conn)
    conn.close()
    return df


def load_visit_excel(excel_path=None):
    """Membaca dan mem-parsing data riwayat kunjungan dari file Excel personalia."""
    target_path = excel_path if (excel_path and os.path.exists(excel_path)) else DEFAULT_EXCEL_PATH
    if not os.path.exists(target_path):
        return pd.DataFrame(), None

    wb = openpyxl.load_workbook(target_path, data_only=True)
    ws = wb.active

    # Deteksi periode dari cell C4/B4 jika ada
    header_info = ""
    for r in range(1, 8):
        v = ws.cell(row=r, column=2).value or ""
        v2 = ws.cell(row=r, column=3).value or ""
        if "Periode" in str(v):
            header_info = str(v2).strip()
            break

    visits = []
    for row_idx in range(9, ws.max_row + 1):
        tgl_raw = ws.cell(row=row_idx, column=3).value
        personalia = ws.cell(row=row_idx, column=4).value
        klien = ws.cell(row=row_idx, column=5).value
        waktu = ws.cell(row=row_idx, column=7).value
        status = ws.cell(row=row_idx, column=8).value
        catatan = ws.cell(row=row_idx, column=9).value

        if not personalia and not klien and not tgl_raw:
            continue

        # Standardisasi nama SCO
        p_clean = str(personalia).strip()
        if p_clean.upper() in ["ABDUL HARIS", "ABDUL HARRIS"]:
            p_clean = "Abdul Harris"

        # Pemetaan koreksi salah ketik (human typo) nomor kode AR oleh SCO lapangan:
        # - AR24353: Febri Kurniawan salah ketik digit ke-4 (3 -> 2) untuk AR24253-BAROKAH CELL(RV)
        # - AR13138: Khoirul Anan salah ketik angka transposisi (13138 -> 31818) untuk AR31818-DZIKRI CELL(RV)
        TYPO_AR_MAP = {
            'AR24353': 'AR24253',
            'AR13138': 'AR31818',
        }

        # Regex cerdas ekstraksi kode AR:
        # Mendukung variasi:
        # - Spasi antara AR dan digit: 'AR 12345', 'AR  12345'
        # - Tanda hubung / pemisah: 'AR-12345', 'AR.12345'
        # - Case-insensitive: 'ar12345', 'Ar12345', 'AR12345'
        # - Typo tertinggal huruf R: 'A06573' -> 'AR06573'
        # - Teks toko yang menempel: 'AR38111sinargaluh500' -> 'AR38111'
        ar_match = re.search(r'(AR[\s.-]*\d{4,5}|A\d{5})', str(klien) if klien else '', re.IGNORECASE)
        ar_id = None
        if ar_match:
            raw_ar = re.sub(r'[\s.-]', '', ar_match.group(1)).upper()
            clean_ar = 'AR' + raw_ar[1:] if raw_ar.startswith('A') and not raw_ar.startswith('AR') else raw_ar
            ar_id = TYPO_AR_MAP.get(clean_ar, clean_ar)

        d_iso = parse_date_str(tgl_raw)
        if d_iso:
            visits.append({
                'date': d_iso,
                'sco': p_clean,
                'ar_id': ar_id,
                'klien': str(klien).strip() if klien else '',
                'waktu': str(waktu).strip() if waktu else '',
                'status': str(status).strip() if status else '',
                'catatan': str(catatan).strip() if catatan else ''
            })

    df_visits = pd.DataFrame(visits)
    return df_visits, header_info


def build_visit_analysis(excel_path=None, force_refresh=False):
    """
    Membangun dataset long format Target vs Realisasi Kunjungan
    dan menghitung seluruh metrik analitik dashboard.
    """
    global _CACHED_VISIT_RESULT

    if not force_refresh and not excel_path:
        if _CACHED_VISIT_RESULT is not None:
            return _CACHED_VISIT_RESULT
        if os.path.exists(SUMMARY_CACHE_FILE):
            try:
                import json
                with open(SUMMARY_CACHE_FILE, "r", encoding="utf-8") as f:
                    _CACHED_VISIT_RESULT = json.load(f)
                    return _CACHED_VISIT_RESULT
            except Exception:
                pass
    df_agents = get_target_agents()
    if df_agents.empty:
        return {"ok": False, "error": "Master data agen dengan jadwal kunjungan tidak ditemukan."}

    df_visits, period_label = load_visit_excel(excel_path)
    if df_visits.empty:
        return {"ok": False, "error": "File laporan kunjungan Excel kosong atau tidak valid."}

    # Range tanggal: ambil min_date dan max_date dari kunjungan
    min_date = df_visits['date'].min()
    max_date = df_visits['date'].max()

    date_range = pd.date_range(min_date, max_date)

    # Buat lookup kunjungan: key (date, sco, ar_id) -> record detail
    # Jika dikunjungi lebih dari sekali dalam hari yang sama, ambil kunjungan pertama/sukses
    visit_lookup = {}
    for _, v in df_visits.iterrows():
        key = (v['date'], v['sco'], v['ar_id'])
        if key not in visit_lookup:
            visit_lookup[key] = {
                'waktu': v['waktu'],
                'status': v['status'],
                'catatan': v['catatan'],
                'klien_input': v['klien']
            }

    # Bangun Long Format: Date x Target Agents
    long_rows = []
    for dt in date_range:
        day_name = dt.day_name()
        d_iso = dt.strftime("%Y-%m-%d")

        # Minggu libur (tidak ada target kunjungan)
        if day_name not in DAY_TO_JADWAL:
            continue

        target_jadwal = DAY_TO_JADWAL[day_name]
        hari_ina = DAY_TO_HARI.get(day_name, day_name)

        # Filter agen yang dijadwalkan pada hari ini
        day_targets = df_agents[df_agents['jadwal'] == target_jadwal]

        for _, ag in day_targets.iterrows():
            sco = ag['sco']
            ar_id = ag['agen_id']
            cab = ag['cabang']
            nama = ag['nama_agen']
            tipe = ag['tipe_agen']

            key = (d_iso, sco, ar_id)
            is_visited = 1 if key in visit_lookup else 0
            score = 1 if is_visited else 0

            v_info = visit_lookup.get(key, {})

            long_rows.append({
                'date': d_iso,
                'day_name': day_name,
                'hari': hari_ina,
                'jadwal': target_jadwal,
                'sco': sco,
                'cabang': cab,
                'agen_id': ar_id,
                'nama_agen': nama,
                'tipe_agen': tipe,
                'target': 1,
                'realisasi': is_visited,
                'score': score,
                'waktu': v_info.get('waktu', ''),
                'status_visit': v_info.get('status', ''),
                'catatan': v_info.get('catatan', ''),
                'klien_input': v_info.get('klien_input', '')
            })

    df_long = pd.DataFrame(long_rows)

    # Simpan ke cache Parquet dan CSV (Long Format)
    os.makedirs(CACHE_DIR, exist_ok=True)
    parquet_path = os.path.join(CACHE_DIR, "visit_target_vs_actual_2026-11.parquet")
    csv_path = os.path.join(CACHE_DIR, "visit_target_vs_actual_2026-11.csv")
    try:
        df_long.to_parquet(parquet_path, index=False)
        df_long.to_csv(csv_path, index=False, encoding="utf-8-sig")
    except Exception as e_save:
        print(f"Warning saving visit cache: {e_save}")

    # ==========================================
    # 1. KPI UTAMA
    # ==========================================
    total_target = int(df_long['target'].sum())
    total_score = int(df_long['score'].sum())
    total_missed = total_target - total_score
    overall_pct = round((total_score / total_target * 100), 1) if total_target > 0 else 0.0

    total_physical_visits = len(df_visits)
    unique_visited_keys = len(visit_lookup)
    
    # Kunjungan di luar jadwal / agen lain
    valid_target_keys = set(zip(df_long['date'], df_long['sco'], df_long['agen_id']))
    off_target_visits = 0
    for key in visit_lookup.keys():
        if key not in valid_target_keys:
            off_target_visits += 1

    # ==========================================
    # 2. LEADERBOARD PER SCO
    # ==========================================
    summary_sco = df_long.groupby('sco').agg(
        cabang=('cabang', lambda x: x.iloc[0] if len(x) > 0 else '-'),
        target=('target', 'sum'),
        score=('score', 'sum')
    ).reset_index()

    summary_sco['missed'] = summary_sco['target'] - summary_sco['score']
    summary_sco['achievement_pct'] = ((summary_sco['score'] / summary_sco['target']) * 100).round(1)
    summary_sco = summary_sco.sort_values(by=['achievement_pct', 'score'], ascending=[False, False])

    leaderboard = []
    rank = 1
    for _, row in summary_sco.iterrows():
        ach = float(row['achievement_pct'])
        if ach >= 85:
            badge_status = "PRIMA"
            badge_color = "#10b981"
        elif ach >= 70:
            badge_status = "BAIK"
            badge_color = "#0284c7"
        else:
            badge_status = "EVALUASI"
            badge_color = "#ef4444"

        leaderboard.append({
            'rank': rank,
            'sco': row['sco'],
            'cabang': row['cabang'],
            'target': int(row['target']),
            'realisasi': int(row['score']),
            'missed': int(row['missed']),
            'achievement_pct': ach,
            'status': badge_status,
            'badge_color': badge_color
        })
        rank += 1

    # ==========================================
    # 3. DAILY MATRIX PER SCO (TANGGAL 1 - 15)
    # ==========================================
    active_dates = sorted(df_long['date'].unique().tolist())
    matrix_data = []

    for item in leaderboard:
        sco_name = item['sco']
        df_sco = df_long[df_long['sco'] == sco_name]
        
        daily_scores = {}
        daily_targets = {}
        for d in active_dates:
            sub = df_sco[df_sco['date'] == d]
            t = int(sub['target'].sum()) if len(sub) > 0 else 0
            s = int(sub['score'].sum()) if len(sub) > 0 else 0
            daily_targets[d] = t
            daily_scores[d] = s

        matrix_data.append({
            'sco': sco_name,
            'cabang': item['cabang'],
            'total_target': item['target'],
            'total_realisasi': item['realisasi'],
            'achievement_pct': item['achievement_pct'],
            'daily_scores': daily_scores,
            'daily_targets': daily_targets
        })

    # ==========================================
    # 4. KEPATUHAN PER SIKLUS JADWAL
    # ==========================================
    jadwal_breakdown = []
    for jw in ['Senin,Kamis', "Selasa,Jum'at", 'Rabu,Sabtu']:
        sub_j = df_long[df_long['jadwal'] == jw]
        t_j = int(sub_j['target'].sum())
        s_j = int(sub_j['score'].sum())
        m_j = t_j - s_j
        p_j = round((s_j / t_j * 100), 1) if t_j > 0 else 0.0
        jadwal_breakdown.append({
            'jadwal': jw,
            'target': t_j,
            'realisasi': s_j,
            'missed': m_j,
            'achievement_pct': p_j
        })

    # ==========================================
    # 5. TOKO TERLEWAT (MISSED VISITS)
    # ==========================================
    missed_df = df_long[df_long['score'] == 0].sort_values(by=['date', 'sco', 'nama_agen'])
    missed_list = []
    for _, r in missed_df.iterrows():
        missed_list.append({
            'date': r['date'],
            'hari': r['hari'],
            'sco': r['sco'],
            'cabang': r['cabang'],
            'agen_id': r['agen_id'],
            'nama_agen': r['nama_agen'],
            'tipe_agen': r['tipe_agen'],
            'jadwal': r['jadwal']
        })

    result = {
        "ok": True,
        "periode": period_label or f"{min_date} s/d {max_date}",
        "min_date": min_date,
        "max_date": max_date,
        "kpi": {
            "total_target": total_target,
            "total_score": total_score,
            "total_missed": total_missed,
            "overall_pct": overall_pct,
            "total_physical_visits": total_physical_visits,
            "off_target_visits": off_target_visits,
            "total_active_days": len(active_dates),
            "top_sco": leaderboard[0]['sco'] if leaderboard else '-'
        },
        "leaderboard": leaderboard,
        "dates": active_dates,
        "matrix": matrix_data,
        "jadwal_breakdown": jadwal_breakdown,
        "missed_sample": missed_list[:100], # Top 100 sample for preview
        "missed_count": len(missed_list),
        "parquet_cache": "visit_target_vs_actual_2026-11.parquet",
        "csv_cache": "visit_target_vs_actual_2026-11.csv"
    }

    _CACHED_VISIT_RESULT = result
    try:
        import json
        with open(SUMMARY_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
    except Exception as e_json:
        print(f"Warning saving summary JSON: {e_json}")

    return result


def get_detail_visits(sco=None, date=None, status_filter=None, limit=200):
    """Mengambil rincian baris target vs realisasi dengan filter SCO, Tanggal, dan Status."""
    parquet_path = os.path.join(CACHE_DIR, "visit_target_vs_actual_2026-11.parquet")
    if not os.path.exists(parquet_path):
        build_visit_analysis()

    if not os.path.exists(parquet_path):
        return []

    df = pd.read_parquet(parquet_path)

    if sco and sco != 'ALL':
        df = df[df['sco'] == sco]
    if date and date != 'ALL':
        df = df[df['date'] == date]
    if status_filter == 'VISITED':
        df = df[df['score'] == 1]
    elif status_filter == 'MISSED':
        df = df[df['score'] == 0]

    return df.head(limit).to_dict(orient="records")
