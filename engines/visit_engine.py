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
import json
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "MASTER", "master_data.db")
LEAVES_FILE = os.path.join(BASE_DIR, "MASTER", "visit_leaves.json")
NAM_PJP_PATH = os.path.join(BASE_DIR, "MASTER", "11_NAM_PJP.xlsx")
DROPBOX_PJP_PATH = r"C:\Users\lisam\Dropbox\List VIP dan Rules\VISIT\2026\NOVEMBER\11_NAM_PJP.xlsx"
COLLECTION_JSON_PATH = os.path.join(BASE_DIR, "MASTER", "sco_collection_kpi.json")
OUTPUT_KPI_EXCEL_PATH = os.path.join(BASE_DIR, "pages", "sco", "KPI_SCO.xlsx")
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
SUMMARY_CACHE_FILE = os.path.join(CACHE_DIR, "visit_summary_cache.json")
_CACHED_VISIT_RESULT = None
_CACHED_PJP_CLAIM_DATA = None
ACTIVE_VISIT_EXCEL_PATH = os.path.join(BASE_DIR, "MASTER", "active_visit_report.xlsx")
UPLOADED_VISIT_PATH = os.path.join(BASE_DIR, ".cache", "uploads", "uploaded_visit_report.xlsx")
DEFAULT_EXCEL_PATH = os.path.join(
    BASE_DIR,
    "Laporan Kunjungan Klien Semua Personalia Versi 2 Periode 1 Nov 2026 - 15 Nov 2026 - 1794806282880.xlsx"
)


def get_active_visit_excel_path():
    """
    Mengambil file Excel laporan kunjungan aktif secara permanen:
    1. MASTER/active_visit_report.xlsx (file kunjungan aktif tersimpan permanen saat upload)
    2. .cache/uploads/uploaded_visit_report.xlsx (file upload terkini)
    3. File 'Laporan Kunjungan*.xlsx' dengan tanggal modifikasi terbaru di root
    4. DEFAULT_EXCEL_PATH (fallback awal)
    """
    candidates = []
    if os.path.exists(ACTIVE_VISIT_EXCEL_PATH) and os.path.getsize(ACTIVE_VISIT_EXCEL_PATH) > 0:
        candidates.append((os.path.getmtime(ACTIVE_VISIT_EXCEL_PATH), ACTIVE_VISIT_EXCEL_PATH))
    if os.path.exists(UPLOADED_VISIT_PATH) and os.path.getsize(UPLOADED_VISIT_PATH) > 0:
        candidates.append((os.path.getmtime(UPLOADED_VISIT_PATH), UPLOADED_VISIT_PATH))

    import glob
    for f in glob.glob(os.path.join(BASE_DIR, "Laporan Kunjungan*.xlsx")):
        candidates.append((os.path.getmtime(f), f))

    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]

    return DEFAULT_EXCEL_PATH

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


def get_active_transacting_ar_ids(months=("2026-10", "2026-11"), force_refresh=False):
    """
    Mengambil set agen_id induk (Store ID) yang memiliki transaksi sukses
    (baik dari terminal direct agen_id maupun dari ID downline/reseller-nya)
    pada bulan lalu dan/atau bulan ini.
    Toko yang 0 transaksi di kedua bulan berturut-turut (dorman/mati) dikeluarkan dari target kunjungan.
    Hasil di-cache di file .cache/active_target_agents.json.
    """
    cache_file = os.path.join(CACHE_DIR, "active_target_agents.json")
    if not force_refresh and os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cached = json.load(f)
                if cached.get("months") == list(months) and "active_ars" in cached:
                    return set(cached["active_ars"])
        except Exception:
            pass

    parquet_path = os.path.join(CACHE_DIR, "trx_astaga_2026.parquet")
    if not os.path.exists(parquet_path):
        return None

    try:
        import pyarrow.parquet as pq
        table = pq.read_table(
            parquet_path,
            columns=['tgl_entry', 'ar_id', 'status'],
            filters=[('status', '=', 'Sukses')]
        )
        df_p = table.to_pandas()
        df_p['m'] = df_p['tgl_entry'].astype(str).str[:7]
        active_terminal_ars = set(df_p[df_p['m'].isin(months)]['ar_id'].dropna().unique())

        # Map terminal/downline ar_id to parent agen_id using cust_full_astaga.parquet
        active_parent_agens = set(active_terminal_ars)
        cust_path = os.path.join(CACHE_DIR, "cust_full_astaga.parquet")
        if os.path.exists(cust_path):
            cust = pd.read_parquet(cust_path, columns=['ar_id', 'agen_id'])
            cust_active = cust[cust['ar_id'].isin(active_terminal_ars)]
            active_parent_agens.update(cust_active['agen_id'].dropna().unique())

        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump({"months": list(months), "active_ars": list(active_parent_agens)}, f)

        return active_parent_agens
    except Exception as e:
        print(f"Warning reading active trx: {e}")
        return None


def get_target_agents(filter_dormant=True, force_refresh=False):
    """
    Mengambil master agen yang memiliki jadwal kunjungan aktif di bawah SCO lapangan.
    Jika filter_dormant=True, hanya menyertakan agen yang memiliki transaksi di bulan lalu / bulan ini
    (mengecualikan toko yang 0 transaksi di kedua bulan berturut-turut).
    """
    if not os.path.exists(DB_PATH):
        return pd.DataFrame(), 0

    conn = sqlite3.connect(DB_PATH)
    query = """
        SELECT brand, agen_id, nama_agen, cabang, type as tipe_agen, sco, jadwal, is_active
        FROM agents
        WHERE sco IN ('Abdul Harris', 'Febri Kurniawan', 'Hupron', 'Khoirul Anan', 'Mas Komarjaya')
          AND jadwal IN ('Senin,Kamis', "Selasa,Jum'at", 'Rabu,Sabtu')
    """
    df = pd.read_sql_query(query, conn)
    conn.close()

    total_master = len(df)
    dormant_excluded = 0

    if filter_dormant:
        active_ars = get_active_transacting_ar_ids(force_refresh=force_refresh)
        if active_ars is not None:
            df_filtered = df[df['agen_id'].isin(active_ars)].reset_index(drop=True)
            dormant_excluded = total_master - len(df_filtered)
            df = df_filtered

    return df, dormant_excluded


def load_visit_excel(excel_path=None):
    """Membaca dan mem-parsing data riwayat kunjungan dari file Excel personalia."""
    target_path = excel_path if (excel_path and os.path.exists(excel_path)) else get_active_visit_excel_path()
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
                with open(SUMMARY_CACHE_FILE, "r", encoding="utf-8") as f:
                    _CACHED_VISIT_RESULT = json.load(f)
                    return _CACHED_VISIT_RESULT
            except Exception:
                pass
    df_agents, dormant_excluded = get_target_agents(filter_dormant=True, force_refresh=force_refresh)
    if df_agents.empty:
        return {"ok": False, "error": "Master data agen dengan jadwal kunjungan tidak ditemukan."}

    df_visits, period_label = load_visit_excel(excel_path)
    if df_visits.empty:
        return {"ok": False, "error": "File laporan kunjungan Excel kosong atau tidak valid."}

    # Rentang tanggal kunjungan riil di file
    min_date_raw = df_visits['date'].min()
    max_date = df_visits['date'].max()

    # ATURAN MULAI TARGET KUNJUNGAN:
    # Karena tgl 30 November = hari Senin (Senin ke-5), maka target kunjungan resmi
    # dimulai pada hari Selasa di awal bulan (3 November 2026), sehingga setiap siklus
    # (Senin-Kamis, Selasa-Jumat, Rabu-Sabtu) tepat memiliki 8 hari target dalam 1 bulan penuh (8x kunjungan ideal).
    target_start_date = "2026-11-03"
    min_date = target_start_date if target_start_date <= max_date else min_date_raw

    date_range = pd.date_range(min_date, max_date)

    # Buat lookup kunjungan: key (date, sco, ar_id) -> record detail
    # Jika dikunjungi lebih dari sekali dalam hari yang sama, ambil kunjungan pertama/sukses
    visit_lookup = {}
    sco_date_visits_count = {}
    for _, v in df_visits.iterrows():
        key = (v['date'], v['sco'], v['ar_id'])
        if key not in visit_lookup:
            visit_lookup[key] = {
                'waktu': v['waktu'],
                'status': v['status'],
                'catatan': v['catatan'],
                'klien_input': v['klien']
            }
        sk = (v['date'], v['sco'])
        sco_date_visits_count[sk] = sco_date_visits_count.get(sk, 0) + 1

    # Load daftar hari izin resmi dari MASTER/visit_leaves.json jika ada
    explicit_leaves = set()
    if os.path.exists(LEAVES_FILE):
        try:
            with open(LEAVES_FILE, "r", encoding="utf-8") as lf:
                leaves_data = json.load(lf)
                for item in leaves_data:
                    s_name = item.get("sco", "").strip()
                    if s_name.upper() in ["ABDUL HARIS", "ABDUL HARRIS"]:
                        s_name = "Abdul Harris"
                    d_val = item.get("date", "").strip()
                    if s_name and d_val:
                        explicit_leaves.add((d_val, s_name))
        except Exception as e_lf:
            print(f"Warning reading visit_leaves.json: {e_lf}")

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

            # Aturan IZIN: Jika terdaftar di visit_leaves.json ATAU realisasi fisik SCO di hari itu adalah NOL
            actual_count = sco_date_visits_count.get((d_iso, sco), 0)
            is_izin = ((d_iso, sco) in explicit_leaves) or (actual_count == 0)

            key = (d_iso, sco, ar_id)
            is_visited = 1 if key in visit_lookup else 0
            v_info = visit_lookup.get(key, {})

            if is_izin:
                # Hari izin/off: Target dinolkan, realisasi & score = 0, toko tidak dihitung terlewat
                target_val = 0
                realisasi_val = 0
                score_val = 0
                is_izin_val = 1
                status_val = 'IZIN'
                catatan_val = 'Izin (Target dinolkan)'
            else:
                target_val = 1
                realisasi_val = is_visited
                score_val = 1 if is_visited else 0
                is_izin_val = 0
                status_val = v_info.get('status', '')
                catatan_val = v_info.get('catatan', '')

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
                'target': target_val,
                'realisasi': realisasi_val,
                'score': score_val,
                'is_izin': is_izin_val,
                'waktu': v_info.get('waktu', ''),
                'status_visit': status_val,
                'catatan': catatan_val,
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
        score=('score', 'sum'),
        izin=('is_izin', 'sum')
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
            'izin': int(row['izin']),
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
        daily_izin = {}
        daily_orig_targets = {}
        for d in active_dates:
            sub = df_sco[df_sco['date'] == d]
            t = int(sub['target'].sum()) if len(sub) > 0 else 0
            s = int(sub['score'].sum()) if len(sub) > 0 else 0
            is_iz = bool((sub['is_izin'] == 1).any()) if len(sub) > 0 else False
            orig_t = len(sub) if len(sub) > 0 else 0

            daily_targets[d] = t
            daily_scores[d] = s
            daily_izin[d] = is_iz
            daily_orig_targets[d] = orig_t

        matrix_data.append({
            'sco': sco_name,
            'cabang': item['cabang'],
            'total_target': item['target'],
            'total_realisasi': item['realisasi'],
            'achievement_pct': item['achievement_pct'],
            'daily_scores': daily_scores,
            'daily_targets': daily_targets,
            'daily_izin': daily_izin,
            'daily_orig_targets': daily_orig_targets
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
    missed_df = df_long[(df_long['target'] > 0) & (df_long['score'] == 0)].sort_values(by=['date', 'sco', 'nama_agen'])
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
            "total_target_agents": len(df_agents),
            "dormant_excluded": dormant_excluded,
            "total_physical_visits": total_physical_visits,
            "off_target_visits": off_target_visits,
            "total_active_days": len(active_dates),
            "total_izin_stores": int((df_long['is_izin'] == 1).sum()),
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
        df = df[(df['target'] > 0) & (df['score'] == 0)]
    elif status_filter == 'IZIN':
        df = df[df.get('is_izin', 0) == 1]

    return df.head(limit).to_dict(orient="records")


# ==============================================================================
# 6. NET CLAIM TRX & KPI SCO (NAM_PJP + KPI SCO ENGINE)
# ==============================================================================

def get_pjp_path():
    """Mengambil path file master NAM_PJP: Dropbox (jika lokal) atau MASTER/ (jika VPS)."""
    if os.path.exists(DROPBOX_PJP_PATH):
        try:
            if not os.path.exists(NAM_PJP_PATH) or os.path.getmtime(DROPBOX_PJP_PATH) > os.path.getmtime(NAM_PJP_PATH):
                import shutil
                shutil.copy2(DROPBOX_PJP_PATH, NAM_PJP_PATH)
        except Exception:
            pass
        return DROPBOX_PJP_PATH
    return NAM_PJP_PATH


def get_pjp_claim_data(force_refresh=False):
    """
    Membaca master data PJP langsung dari master_data.db dan transaksi terkini (.parquet)
    untuk mengevaluasi hak klaim transaksi per toko (Threshold 60% Kunjungan).
    HUKUM KLAIM: Jika % Visit >= 60%, SCO berhak klaim Net Trx. Jika < 60%, Net Trx HANGUS (0).
    Fallback otomatis ke 11_NAM_PJP.xlsx jika database/parquet belum tersedia.
    """
    global _CACHED_PJP_CLAIM_DATA
    if not force_refresh and _CACHED_PJP_CLAIM_DATA is not None:
        return _CACHED_PJP_CLAIM_DATA

    # 1. Coba generate langsung dari master_data.db + Parquet
    trx_parquet = os.path.join(CACHE_DIR, "trx_astaga_2026.parquet")
    cust_parquet = os.path.join(CACHE_DIR, "cust_full_astaga.parquet")
    visit_parquet = os.path.join(CACHE_DIR, "visit_target_vs_actual_2026-11.parquet")

    if os.path.exists(DB_PATH) and os.path.exists(trx_parquet):
        try:
            import pyarrow.parquet as pq
            import engines.metrics_engine as me

            # A. Query Agents dari master_data.db
            conn = sqlite3.connect(DB_PATH)
            query = """
                SELECT brand, agen_id, nama_agen, cabang, type as tipe_agen, sco, dso, jadwal, location as lokasi
                FROM agents
                WHERE sco IN ('Abdul Harris', 'Febri Kurniawan', 'Hupron', 'Khoirul Anan', 'Mas Komarjaya')
                  AND jadwal IN ('Senin,Kamis', "Selasa,Jum'at", 'Rabu,Sabtu')
                  AND is_active = 1
                ORDER BY sco, cabang, nama_agen
            """
            df_agents = pd.read_sql_query(query, conn)
            conn.close()

            # B. Query Transaksi (Oktober & November 2026) - Fast PyArrow Scanner
            table = pq.read_table(
                trx_parquet,
                columns=['tgl_entry', 'ar_id', 'status'],
                filters=[
                    ('status', '=', 'Sukses'),
                    ('tgl_entry', '>=', pd.Timestamp('2026-10-01'))
                ]
            )
            df_trx = table.to_pandas()
            df_trx['m'] = df_trx['tgl_entry'].dt.month

            # Mapping sub-reseller ke parent agen
            if os.path.exists(cust_parquet):
                cust = pd.read_parquet(cust_parquet, columns=['ar_id', 'agen_id'])
                df_trx = df_trx.merge(cust, on='ar_id', how='left')
                df_trx['parent_agen'] = df_trx['agen_id'].fillna(df_trx['ar_id'])
            else:
                df_trx['parent_agen'] = df_trx['ar_id']

            # Hukum 4 GEMINI.md: Exclude akun internal operasional
            df_trx = df_trx[~df_trx['ar_id'].isin(["AR00037", "AR00009", "AR20408"])]

            oct_df = df_trx[df_trx['m'] == 10]
            nov_df = df_trx[df_trx['m'] == 11]

            oct_counts = oct_df.groupby('parent_agen').size().to_dict()
            nov_counts = nov_df.groupby('parent_agen').size().to_dict()

            oct_days = 31.0
            nov_days = float(me.get_active_days(nov_df))
            if nov_days <= 0:
                nov_days = 1.0

            # C. Kunjungan Target & Realisasi
            if force_refresh or not os.path.exists(visit_parquet):
                build_visit_analysis()

            if os.path.exists(visit_parquet):
                df_visit = pd.read_parquet(visit_parquet)
                visit_summary = df_visit.groupby('agen_id').agg({'target': 'sum', 'score': 'sum'}).to_dict('index')
            else:
                visit_summary = {}

            stores = []
            total_gross_oct = 0.0
            total_gross_nov = 0.0
            total_net_trx = 0.0
            total_lost_trx = 0.0
            passed_cnt = 0
            failed_cnt = 0
            scos_agg = {}

            for idx, r in df_agents.iterrows():
                ar_id = str(r['agen_id']).strip()
                oct_hits = oct_counts.get(ar_id, 0)
                nov_hits = nov_counts.get(ar_id, 0)

                # Filter toko target aktif: ada transaksi di bulan lalu atau bulan ini
                if oct_hits == 0 and nov_hits == 0:
                    continue

                jadwal = str(r['jadwal'] or "").strip()
                sco = str(r['sco'] or "").strip()
                dso = str(r['dso'] or "").strip()
                nama_agen = str(r['nama_agen'] or "").strip()
                cabang = str(r['cabang'] or "").strip()
                lokasi = str(r['lokasi'] or "").strip()

                oct_rate = round(oct_hits / oct_days, 4)
                nov_rate = round(nov_hits / nov_days, 4)

                v = visit_summary.get(ar_id, {'target': 0, 'score': 0})
                tgt_visit = int(v.get('target', 0))
                ach_visit = int(v.get('score', 0))
                ach_pct = round(ach_visit / tgt_visit, 4) if tgt_visit > 0 else 0.0

                # HUKUM KLAIM TRANSAKSI (THRESHOLD 60%)
                is_claimable = bool(ach_pct >= 0.60)
                net_trx = nov_rate if is_claimable else 0.0
                lost_trx = nov_rate if not is_claimable else 0.0
                growth = round(nov_rate - oct_rate, 4)

                if is_claimable:
                    passed_cnt += 1
                else:
                    failed_cnt += 1

                total_gross_oct += oct_rate
                total_gross_nov += nov_rate
                total_net_trx += net_trx
                total_lost_trx += lost_trx

                if sco:
                    if sco not in scos_agg:
                        scos_agg[sco] = {
                            "sco": sco,
                            "cabang": cabang,
                            "total_stores": 0,
                            "passed_stores": 0,
                            "failed_stores": 0,
                            "oct_gross": 0.0,
                            "nov_gross": 0.0,
                            "net_trx": 0.0,
                            "lost_trx": 0.0,
                            "visit_tgt": 0,
                            "visit_ach": 0
                        }
                    scos_agg[sco]["total_stores"] += 1
                    if is_claimable:
                        scos_agg[sco]["passed_stores"] += 1
                    else:
                        scos_agg[sco]["failed_stores"] += 1
                    scos_agg[sco]["oct_gross"] += oct_rate
                    scos_agg[sco]["nov_gross"] += nov_rate
                    scos_agg[sco]["net_trx"] += net_trx
                    scos_agg[sco]["lost_trx"] += lost_trx
                    scos_agg[sco]["visit_tgt"] += tgt_visit
                    scos_agg[sco]["visit_ach"] += ach_visit

                stores.append({
                    "no": len(stores) + 1,
                    "agen_id": ar_id,
                    "jadwal": jadwal,
                    "sco": sco,
                    "dso": dso,
                    "nama_agen": nama_agen,
                    "cabang": cabang,
                    "lokasi": lokasi,
                    "oct_trx": round(oct_rate, 4),
                    "nov_trx": round(nov_rate, 4),
                    "tgt_visit": tgt_visit,
                    "ach_visit": ach_visit,
                    "ach_pct": round(ach_pct, 4),
                    "is_claimable": is_claimable,
                    "status_claim": "BERHAK KLAIM" if is_claimable else "HANGUS",
                    "net_trx": round(net_trx, 4),
                    "lost_trx": round(lost_trx, 4),
                    "growth": growth
                })

            summary = {
                "total_stores": len(stores),
                "passed_stores": passed_cnt,
                "failed_stores": failed_cnt,
                "passed_pct": round(passed_cnt / len(stores) * 100, 1) if stores else 0.0,
                "failed_pct": round(failed_cnt / len(stores) * 100, 1) if stores else 0.0,
                "total_gross_oct": round(total_gross_oct, 2),
                "total_gross_nov": round(total_gross_nov, 2),
                "total_net_trx": round(total_net_trx, 2),
                "total_lost_trx": round(total_lost_trx, 2),
                "source": "master_data.db",
                "active_days_nov": nov_days
            }

            res = {
                "ok": True,
                "summary": summary,
                "scos_agg": scos_agg,
                "stores": stores
            }
            _CACHED_PJP_CLAIM_DATA = res
            return res
        except Exception as e_dyn:
            print(f"[PJP Engine] Fallback to NAM_PJP.xlsx: {e_dyn}")

    # 2. Fallback to Excel NAM_PJP.xlsx jika master_data.db atau Parquet belum tersedia
    path = get_pjp_path()
    if not os.path.exists(path):
        return {"ok": False, "error": f"File master NAM_PJP tidak ditemukan: {path}"}

    wb = openpyxl.load_workbook(path, data_only=True)
    if "NAM_PJP" not in wb.sheetnames:
        return {"ok": False, "error": "Sheet NAM_PJP tidak ditemukan"}

    ws = wb["NAM_PJP"]
    stores = []

    total_gross_oct = 0.0
    total_gross_nov = 0.0
    total_net_trx = 0.0
    total_lost_trx = 0.0
    passed_cnt = 0
    failed_cnt = 0

    scos_agg = {}

    for r in range(2, ws.max_row + 1):
        ar_id = ws.cell(r, 1).value
        if not ar_id:
            continue
        jadwal = str(ws.cell(r, 2).value or "").strip()
        sco = str(ws.cell(r, 3).value or "").strip()
        dso = str(ws.cell(r, 4).value or "").strip()
        nama_agen = str(ws.cell(r, 5).value or "").strip()
        cabang = str(ws.cell(r, 6).value or "").strip()
        lokasi = str(ws.cell(r, 7).value or "").strip()

        oct_trx = float(ws.cell(r, 8).value or 0.0)
        nov_trx = float(ws.cell(r, 9).value or 0.0)
        tgt_visit = int(ws.cell(r, 10).value or 0)
        ach_visit = int(ws.cell(r, 11).value or 0)

        ach_pct = float(ws.cell(r, 12).value or 0.0)
        if ach_pct == 0.0 and tgt_visit > 0 and ach_visit > 0:
            ach_pct = ach_visit / tgt_visit

        # HUKUM KLAIM TRANSAKSI (THRESHOLD 60%)
        is_claimable = bool(ach_pct >= 0.60)
        net_trx = nov_trx if is_claimable else 0.0
        lost_trx = nov_trx if not is_claimable else 0.0
        growth = nov_trx - oct_trx

        if is_claimable:
            passed_cnt += 1
        else:
            failed_cnt += 1

        total_gross_oct += oct_trx
        total_gross_nov += nov_trx
        total_net_trx += net_trx
        total_lost_trx += lost_trx

        if sco:
            if sco not in scos_agg:
                scos_agg[sco] = {
                    "sco": sco,
                    "cabang": cabang,
                    "total_stores": 0,
                    "passed_stores": 0,
                    "failed_stores": 0,
                    "oct_gross": 0.0,
                    "nov_gross": 0.0,
                    "net_trx": 0.0,
                    "lost_trx": 0.0,
                    "visit_tgt": 0,
                    "visit_ach": 0
                }
            scos_agg[sco]["total_stores"] += 1
            if is_claimable:
                scos_agg[sco]["passed_stores"] += 1
            else:
                scos_agg[sco]["failed_stores"] += 1
            scos_agg[sco]["oct_gross"] += oct_trx
            scos_agg[sco]["nov_gross"] += nov_trx
            scos_agg[sco]["net_trx"] += net_trx
            scos_agg[sco]["lost_trx"] += lost_trx
            scos_agg[sco]["visit_tgt"] += tgt_visit
            scos_agg[sco]["visit_ach"] += ach_visit

        stores.append({
            "no": r - 1,
            "agen_id": str(ar_id).strip(),
            "jadwal": jadwal,
            "sco": sco,
            "dso": dso,
            "nama_agen": nama_agen,
            "cabang": cabang,
            "lokasi": lokasi,
            "oct_trx": round(oct_trx, 4),
            "nov_trx": round(nov_trx, 4),
            "tgt_visit": tgt_visit,
            "ach_visit": ach_visit,
            "ach_pct": round(ach_pct, 4),
            "is_claimable": is_claimable,
            "status_claim": "BERHAK KLAIM" if is_claimable else "HANGUS",
            "net_trx": round(net_trx, 4),
            "lost_trx": round(lost_trx, 4),
            "growth": round(growth, 4)
        })

    summary = {
        "total_stores": len(stores),
        "passed_stores": passed_cnt,
        "failed_stores": failed_cnt,
        "passed_pct": round(passed_cnt / len(stores) * 100, 1) if stores else 0.0,
        "failed_pct": round(failed_cnt / len(stores) * 100, 1) if stores else 0.0,
        "total_gross_oct": round(total_gross_oct, 2),
        "total_gross_nov": round(total_gross_nov, 2),
        "total_net_trx": round(total_net_trx, 2),
        "total_lost_trx": round(total_lost_trx, 2),
        "source": "11_NAM_PJP.xlsx"
    }

    res = {
        "ok": True,
        "summary": summary,
        "scos_agg": scos_agg,
        "stores": stores
    }
    _CACHED_PJP_CLAIM_DATA = res
    return res


def get_kpi_sco_data(force_refresh=False):
    """
    Menghitung rekapitulasi KPI SCO 4 Pilar dan estimasi uang insentif:
    1. Daily Visit Agen (15%)
    2. Collection (25%) -> Input manual
    3. Daily Transaction Net (35%) -> Net Trx Tab 2 / (Baseline Okt + 50)
    4. Growth Transaction Gross (25%) -> Pertumbuhan Nov vs Okt
    Total Score -> Multiplier -> Insentif (Rp 50 * Net Trx * 31 * Multiplier)
    """
    claim_res = get_pjp_claim_data(force_refresh=force_refresh)
    if not claim_res.get("ok"):
        return claim_res

    scos_agg = claim_res["scos_agg"]

    # Ambil Pilar 1 (Daily Visit Agen) langsung dari Tab 1 Leaderboard agar 100% konsisten
    try:
        visit_analysis = build_visit_analysis()
        visit_leaderboard = {row['sco']: row for row in visit_analysis.get('leaderboard', [])}
    except Exception:
        visit_leaderboard = {}

    # Load manual collection inputs
    coll_data = {}
    if os.path.exists(COLLECTION_JSON_PATH):
        try:
            with open(COLLECTION_JSON_PATH, "r", encoding="utf-8") as f:
                coll_data = json.load(f)
        except Exception:
            pass

    DEFAULT_COLL = {
        "Hupron": {"target": 350, "realisasi": 335},
        "Abdul Harris": {"target": 323, "realisasi": 295},
        "Khoirul Anan": {"target": 203, "realisasi": 191},
        "Febri Kurniawan": {"target": 129, "realisasi": 128},
        "Mas Komarjaya": {"target": 272, "realisasi": 259}
    }

    SCO_ORDER = [
        ("Hupron", "BSD"),
        ("Abdul Harris", "ICON"),
        ("Febri Kurniawan", "PP"),
        ("Mas Komarjaya", "PP"),
        ("Khoirul Anan", "PRG")
    ]

    kpi_rows = []

    for sco_name, cabang_def in SCO_ORDER:
        agg = scos_agg.get(sco_name, {
            "total_stores": 0, "oct_gross": 0.0, "nov_gross": 0.0,
            "net_trx": 0.0, "visit_tgt": 0, "visit_ach": 0, "cabang": cabang_def
        })

        # Collection manual input
        coll = coll_data.get(sco_name) or DEFAULT_COLL.get(sco_name, {"target": 0, "realisasi": 0})
        coll_tgt = float(coll.get("target", 0))
        coll_ach = float(coll.get("realisasi") if coll.get("realisasi") is not None else coll.get("actual", 0))
        coll_pct = (coll_ach / coll_tgt) if coll_tgt > 0 else 0.0
        coll_score = coll_pct * 0.25

        # 1. Visit (15%) - diambil langsung dari Tab 1 Leaderboard
        if sco_name in visit_leaderboard:
            v_tgt = int(visit_leaderboard[sco_name].get('target', 0))
            v_ach = int(visit_leaderboard[sco_name].get('realisasi', 0))
            v_pct = (v_ach / v_tgt) if v_tgt > 0 else 0.0
        else:
            v_tgt = agg["visit_tgt"]
            v_ach = agg["visit_ach"]
            v_pct = (v_ach / v_tgt) if v_tgt > 0 else 0.0
        v_score = v_pct * 0.15

        # 3. Daily Trx Net (35%)
        oct_gross = agg["oct_gross"]
        nov_gross = agg["nov_gross"]
        net_tgt = oct_gross + 50.0
        net_trx = agg["net_trx"]
        net_pct = (net_trx / net_tgt) if net_tgt > 0 else 0.0
        net_score = net_pct * 0.35

        # 4. Growth Gross (25%)
        growth_pct = ((nov_gross - oct_gross) / oct_gross) if oct_gross > 0 else 0.0
        growth_score = growth_pct * 0.25

        # Total KPI Score
        total_score = v_score + coll_score + net_score + growth_score

        # Multiplier Insentif
        if total_score > 1.20:
            multiplier = 1.20
        elif total_score >= 0.60:
            multiplier = total_score
        elif total_score >= 0.50:
            multiplier = 0.50
        else:
            multiplier = 0.0

        # Insentif Rupiah: Rp 50 * (Net Trx * 31) * Multiplier
        est_insentif = 50.0 * (net_trx * 31.0) * multiplier

        kpi_rows.append({
            "sco": sco_name,
            "cabang": agg.get("cabang", cabang_def),
            "total_stores": agg["total_stores"],
            "visit_target": v_tgt,
            "visit_realisasi": v_ach,
            "visit_ach_pct": round(v_pct, 4),
            "visit_score": round(v_score, 4),
            "coll_target": coll_tgt,
            "coll_realisasi": coll_ach,
            "coll_ach_pct": round(coll_pct, 4),
            "coll_score": round(coll_score, 4),
            "net_target": round(net_tgt, 2),
            "net_trx": round(net_trx, 2),
            "net_ach_pct": round(net_pct, 4),
            "net_score": round(net_score, 4),
            "oct_gross": round(oct_gross, 2),
            "nov_gross": round(nov_gross, 2),
            "growth_pct": round(growth_pct, 4),
            "growth_score": round(growth_score, 4),
            "total_score": round(total_score, 4),
            "multiplier": round(multiplier, 4),
            "estimasi_insentif": int(round(est_insentif))
        })

    # Urutan Cabang Resmi: BSD -> ICON -> PP -> PRG
    for idx, r in enumerate(kpi_rows):
        r["no"] = idx + 1

    # Summary Totals
    tot_stores = sum(r["total_stores"] for r in kpi_rows)
    tot_v_tgt = sum(r["visit_target"] for r in kpi_rows)
    tot_v_ach = sum(r["visit_realisasi"] for r in kpi_rows)
    tot_v_pct = (tot_v_ach / tot_v_tgt) if tot_v_tgt > 0 else 0.0
    tot_v_score = tot_v_pct * 0.15

    tot_c_tgt = sum(r["coll_target"] for r in kpi_rows)
    tot_c_ach = sum(r["coll_realisasi"] for r in kpi_rows)
    tot_c_pct = (tot_c_ach / tot_c_tgt) if tot_c_tgt > 0 else 0.0
    tot_c_score = tot_c_pct * 0.25

    tot_net_tgt = sum(r["net_target"] for r in kpi_rows)
    tot_net_trx = sum(r["net_trx"] for r in kpi_rows)
    tot_net_pct = (tot_net_trx / tot_net_tgt) if tot_net_tgt > 0 else 0.0
    tot_net_score = tot_net_pct * 0.35

    tot_oct_gross = sum(r["oct_gross"] for r in kpi_rows)
    tot_nov_gross = sum(r["nov_gross"] for r in kpi_rows)
    tot_growth_pct = ((tot_nov_gross - tot_oct_gross) / tot_oct_gross) if tot_oct_gross > 0 else 0.0
    tot_growth_score = tot_growth_pct * 0.25

    tot_score = tot_v_score + tot_c_score + tot_net_score + tot_growth_score
    tot_mult = min(1.20, tot_score) if tot_score >= 0.60 else (0.50 if tot_score >= 0.50 else 0.0)
    tot_insentif = sum(r["estimasi_insentif"] for r in kpi_rows)

    totals = {
        "total_stores": tot_stores,
        "visit_target": tot_v_tgt,
        "visit_realisasi": tot_v_ach,
        "visit_ach_pct": round(tot_v_pct, 4),
        "visit_score": round(tot_v_score, 4),
        "coll_target": tot_c_tgt,
        "coll_realisasi": tot_c_ach,
        "coll_ach_pct": round(tot_c_pct, 4),
        "coll_score": round(tot_c_score, 4),
        "net_target": round(tot_net_tgt, 2),
        "net_trx": round(tot_net_trx, 2),
        "net_ach_pct": round(tot_net_pct, 4),
        "net_score": round(tot_net_score, 4),
        "oct_gross": round(tot_oct_gross, 2),
        "nov_gross": round(tot_nov_gross, 2),
        "growth_pct": round(tot_growth_pct, 4),
        "growth_score": round(tot_growth_score, 4),
        "total_score": round(tot_score, 4),
        "multiplier": round(tot_mult, 4),
        "estimasi_insentif": tot_insentif
    }

    result = {
        "ok": True,
        "kpi": kpi_rows,
        "totals": totals
    }

    # Automatically generate pages/sco/KPI_SCO.xlsx
    try:
        export_kpi_sco_excel(result, claim_res.get("stores", []))
    except Exception as e_exp:
        print(f"Warning exporting KPI_SCO.xlsx: {e_exp}")

    return result


def save_collection_kpi(data_dict):
    """Menyimpan data manual collection target & realisasi per SCO ke MASTER/sco_collection_kpi.json."""
    os.makedirs(os.path.dirname(COLLECTION_JSON_PATH), exist_ok=True)
    with open(COLLECTION_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data_dict, f, indent=2)
    return get_kpi_sco_data(force_refresh=True)


def export_kpi_sco_excel(kpi_data, pjp_stores=None):
    """
    Menghasilkan file Excel resmi KPI_SCO.xlsx dengan 2 sheet:
    1. 'KPI SCO': Format scorecard 4 pilar lengkap dengan bobot, formula, dan insentif.
    2. 'NAM_PJP': Seluruh toko mapping dengan status klaim dan Net Trx.
    """
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()

    # SHEET 1: KPI SCO
    ws = wb.active
    ws.title = "KPI SCO"
    ws.views.sheetView[0].showGridLines = True

    NAVY_LIGHT = "DBEAFE"
    GRAY_HEADER = "F1F5F9"
    BORDER_COLOR = "CBD5E1"

    thin_border = Border(
        left=Side(style='thin', color=BORDER_COLOR),
        right=Side(style='thin', color=BORDER_COLOR),
        top=Side(style='thin', color=BORDER_COLOR),
        bottom=Side(style='thin', color=BORDER_COLOR)
    )

    # Title
    ws.merge_cells("B3:X3")
    c_title = ws.cell(3, 2, "REKAPITULASI KPI SCO - NOVEMBER 2026")
    c_title.font = Font(name="Calibri", size=14, bold=True, color="0F172A")
    c_title.alignment = Alignment(horizontal="center", vertical="center")

    # Header Row 6: Bobot
    ws.cell(6, 2, "CABANG").font = Font(bold=True)
    ws.cell(6, 3, "NAMA").font = Font(bold=True)
    ws.cell(6, 4, "#PJP").font = Font(bold=True)

    ws.merge_cells("E6:H6")
    ws.cell(6, 5, "Bobot 15%").font = Font(bold=True, color="1E3A8A")
    ws.cell(6, 5).alignment = Alignment(horizontal="center")
    ws.cell(6, 5).fill = PatternFill(start_color=NAVY_LIGHT, end_color=NAVY_LIGHT, fill_type="solid")

    ws.merge_cells("I6:L6")
    ws.cell(6, 9, "Bobot 25%").font = Font(bold=True, color="047857")
    ws.cell(6, 9).alignment = Alignment(horizontal="center")
    ws.cell(6, 9).fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")

    ws.merge_cells("M6:P6")
    ws.cell(6, 13, "Bobot 35%").font = Font(bold=True, color="7C3AED")
    ws.cell(6, 13).alignment = Alignment(horizontal="center")
    ws.cell(6, 13).fill = PatternFill(start_color="EDE9FE", end_color="EDE9FE", fill_type="solid")

    ws.merge_cells("Q6:T6")
    ws.cell(6, 17, "Bobot 25%").font = Font(bold=True, color="D97706")
    ws.cell(6, 17).alignment = Alignment(horizontal="center")
    ws.cell(6, 17).fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")

    ws.cell(6, 21, "TOTAL SCORE").font = Font(bold=True)
    ws.cell(6, 21).alignment = Alignment(horizontal="center")
    ws.cell(6, 23, "MULTIPLIER").font = Font(bold=True)
    ws.cell(6, 23).alignment = Alignment(horizontal="center")
    ws.cell(6, 24, "INSENTIF (RP)").font = Font(bold=True)
    ws.cell(6, 24).alignment = Alignment(horizontal="center")

    # Header Row 7: Pillar Titles
    ws.merge_cells("E7:H7")
    ws.cell(7, 5, "DAILY VISIT AGEN").font = Font(bold=True)
    ws.cell(7, 5).alignment = Alignment(horizontal="center")

    ws.merge_cells("I7:L7")
    ws.cell(7, 9, "COLLECTION").font = Font(bold=True)
    ws.cell(7, 9).alignment = Alignment(horizontal="center")

    ws.merge_cells("M7:P7")
    ws.cell(7, 13, "DAILY TRANSACTION (NET)").font = Font(bold=True)
    ws.cell(7, 13).alignment = Alignment(horizontal="center")

    ws.merge_cells("Q7:T7")
    ws.cell(7, 17, "GROWTH TRANSACTION (GROSS)").font = Font(bold=True)
    ws.cell(7, 17).alignment = Alignment(horizontal="center")

    # Header Row 8: Sub-columns
    sub_headers = {
        2: "CABANG", 3: "NAMA", 4: "#PJP",
        5: "Tgt", 6: "Ach", 7: "% Ach", 8: "Score",
        9: "Tgt", 10: "Ach", 11: "% Ach", 12: "Score",
        13: "Net Tgt", 14: "Net Trx", 15: "% Ach", 16: "Score",
        17: "Bulan Lalu", 18: "Bulan Ini", 19: "% Growth", 20: "Score",
        21: "Total Score", 23: "Multiplier", 24: "Insentif (Rp)"
    }
    for col_idx, h_text in sub_headers.items():
        cell = ws.cell(8, col_idx, h_text)
        cell.font = Font(bold=True, size=10)
        cell.alignment = Alignment(horizontal="center")
        cell.fill = PatternFill(start_color=GRAY_HEADER, end_color=GRAY_HEADER, fill_type="solid")
        cell.border = thin_border

    # Data Rows
    curr_row = 9
    for item in kpi_data.get("kpi", []):
        ws.cell(curr_row, 2, item["cabang"]).alignment = Alignment(horizontal="center")
        ws.cell(curr_row, 3, item["sco"]).font = Font(bold=True)
        ws.cell(curr_row, 4, item["total_stores"]).alignment = Alignment(horizontal="center")

        # 1. Visit (15%)
        ws.cell(curr_row, 5, item["visit_target"]).number_format = "#,##0"
        ws.cell(curr_row, 6, item["visit_realisasi"]).number_format = "#,##0"
        c7 = ws.cell(curr_row, 7, f"=IFERROR(F{curr_row}/E{curr_row},0)")
        c7.number_format = "0.0%"
        c8 = ws.cell(curr_row, 8, f"=G{curr_row}*15%")
        c8.number_format = "0.0%"

        # 2. Collection (25%)
        ws.cell(curr_row, 9, item["coll_target"]).number_format = "#,##0"
        ws.cell(curr_row, 10, item["coll_realisasi"]).number_format = "#,##0"
        c11 = ws.cell(curr_row, 11, f"=IFERROR(J{curr_row}/I{curr_row},0)")
        c11.number_format = "0.0%"
        c12 = ws.cell(curr_row, 12, f"=K{curr_row}*25%")
        c12.number_format = "0.0%"

        # 3. Daily Trx Net (35%)
        ws.cell(curr_row, 13, f"=Q{curr_row}+50").number_format = "#,##0"
        ws.cell(curr_row, 14, item["net_trx"]).number_format = "#,##0"
        c15 = ws.cell(curr_row, 15, f"=IFERROR(N{curr_row}/M{curr_row},0)")
        c15.number_format = "0.0%"
        c16 = ws.cell(curr_row, 16, f"=O{curr_row}*35%")
        c16.number_format = "0.0%"

        # 4. Growth Gross (25%)
        ws.cell(curr_row, 17, item["oct_gross"]).number_format = "#,##0"
        ws.cell(curr_row, 18, item["nov_gross"]).number_format = "#,##0"
        c19 = ws.cell(curr_row, 19, f"=(R{curr_row}-Q{curr_row})/Q{curr_row}")
        c19.number_format = "0.0%"
        c20 = ws.cell(curr_row, 20, f"=S{curr_row}*25%")
        c20.number_format = "0.0%"

        # Total Score & Incentive
        c21 = ws.cell(curr_row, 21, f"=H{curr_row}+L{curr_row}+P{curr_row}+T{curr_row}")
        c21.number_format = "0.0%"
        c21.font = Font(bold=True, color="1E3A8A")

        c23 = ws.cell(curr_row, 23, f"=IF(U{curr_row}>1.2,1.2,IF(U{curr_row}>=0.6,U{curr_row},IF(U{curr_row}>=0.5,0.5,0)))")
        c23.number_format = "0.0%"
        c23.font = Font(bold=True)

        c24 = ws.cell(curr_row, 24, f"=50*(N{curr_row}*31)*W{curr_row}")
        c24.number_format = "Rp #,##0"
        c24.font = Font(bold=True, color="047857")

        for c_idx in range(2, 25):
            if c_idx != 22:
                ws.cell(curr_row, c_idx).border = thin_border

        curr_row += 1

    # Total Row
    tot_row = curr_row
    ws.cell(tot_row, 2, "TOTAL").font = Font(bold=True)
    ws.cell(tot_row, 4, f"=SUM(D9:D{tot_row-1})").font = Font(bold=True)
    ws.cell(tot_row, 5, f"=SUM(E9:E{tot_row-1})").font = Font(bold=True)
    ws.cell(tot_row, 6, f"=SUM(F9:F{tot_row-1})").font = Font(bold=True)
    ws.cell(tot_row, 7, f"=IFERROR(F{tot_row}/E{tot_row},0)").number_format = "0.0%"
    ws.cell(tot_row, 8, f"=G{tot_row}*15%").number_format = "0.0%"

    ws.cell(tot_row, 9, f"=SUM(I9:I{tot_row-1})").font = Font(bold=True)
    ws.cell(tot_row, 10, f"=SUM(J9:J{tot_row-1})").font = Font(bold=True)
    ws.cell(tot_row, 11, f"=IFERROR(J{tot_row}/I{tot_row},0)").number_format = "0.0%"
    ws.cell(tot_row, 12, f"=K{tot_row}*25%").number_format = "0.0%"

    ws.cell(tot_row, 13, f"=SUM(M9:M{tot_row-1})").number_format = "#,##0"
    ws.cell(tot_row, 13).font = Font(bold=True)
    ws.cell(tot_row, 14, f"=SUM(N9:N{tot_row-1})").number_format = "#,##0"
    ws.cell(tot_row, 14).font = Font(bold=True)
    ws.cell(tot_row, 15, f"=IFERROR(N{tot_row}/M{tot_row},0)").number_format = "0.0%"
    ws.cell(tot_row, 16, f"=O{tot_row}*35%").number_format = "0.0%"

    ws.cell(tot_row, 17, f"=SUM(Q9:Q{tot_row-1})").number_format = "#,##0"
    ws.cell(tot_row, 17).font = Font(bold=True)
    ws.cell(tot_row, 18, f"=SUM(R9:R{tot_row-1})").number_format = "#,##0"
    ws.cell(tot_row, 18).font = Font(bold=True)
    ws.cell(tot_row, 19, f"=(R{tot_row}-Q{tot_row})/Q{tot_row}").number_format = "0.0%"
    ws.cell(tot_row, 20, f"=S{tot_row}*25%").number_format = "0.0%"

    ws.cell(tot_row, 21, f"=H{tot_row}+L{tot_row}+P{tot_row}+T{tot_row}").number_format = "0.0%"
    ws.cell(tot_row, 21).font = Font(bold=True, color="1E3A8A")

    ws.cell(tot_row, 23, f"=IF(U{tot_row}>1.2,1.2,IF(U{tot_row}>=0.6,U{tot_row},IF(U{tot_row}>=0.5,0.5,0)))").number_format = "0.0%"
    ws.cell(tot_row, 23).font = Font(bold=True)

    ws.cell(tot_row, 24, f"=SUM(X9:X{tot_row-1})").number_format = "Rp #,##0"
    ws.cell(tot_row, 24).font = Font(bold=True, color="047857")

    for c_idx in range(2, 25):
        if c_idx != 22:
            cell = ws.cell(tot_row, c_idx)
            cell.border = thin_border
            cell.fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")

    # Glossary Section
    gl_row = tot_row + 4
    ws.cell(gl_row, 2, "GLOSSARY & KETENTUAN INSENTIF SCO").font = Font(bold=True, size=11, color="1E3A8A")
    gl_lines = [
        ("INCENTIVE SCO", "Rp 50 per transaksi dari Achieved Transaksi Bersih Bulanan NAM"),
        ("FINAL INCENTIVE", "Rp 50 x (Trx Bersih Daily x 31 Hari) x Multiplier KPI Score"),
        ("SYARAT KLAIM TOKO (NET TRX)", "Toko wajib memiliki % Kepatuhan Visit >= 60%. Jika visit < 60%, Net Trx toko tersebut HANGUS (0)."),
        ("MULTIPLIER KPI", "Score >= 120% -> 120% (Cap) | 60% - 120% -> Score | 50% - 59.9% -> 50% | < 50% -> 0% (Gugur)")
    ]
    for idx, (param, desc) in enumerate(gl_lines, start=gl_row+1):
        ws.cell(idx, 2, param).font = Font(bold=True, size=9)
        ws.cell(idx, 4, desc).font = Font(size=9, color="475569")

    # Widths
    for c in range(2, 25):
        ws.column_dimensions[get_column_letter(c)].width = 14
    ws.column_dimensions["B"].width = 12
    ws.column_dimensions["C"].width = 18
    ws.column_dimensions["X"].width = 18

    # SHEET 2: NAM_PJP
    if pjp_stores:
        ws2 = wb.create_sheet(title="NAM_PJP")
        ws2.views.sheetView[0].showGridLines = True
        pjp_headers = [
            "AGEN ID", "JADWAL", "SCO", "DSO", "NAMA AGEN", "CABANG", "LOKASI",
            "10 (Okt)", "11 (Nov)", "Tgt Visit", "Ach Visit", "% Ach", "Net Trx", "Growth Trx", "Status Klaim"
        ]
        for c_idx, h_text in enumerate(pjp_headers, start=1):
            cell = ws2.cell(1, c_idx, h_text)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
            cell.alignment = Alignment(horizontal="center")

        for r_idx, s in enumerate(pjp_stores, start=2):
            ws2.cell(r_idx, 1, s["agen_id"])
            ws2.cell(r_idx, 2, s["jadwal"])
            ws2.cell(r_idx, 3, s["sco"])
            ws2.cell(r_idx, 4, s.get("dso", ""))
            ws2.cell(r_idx, 5, s["nama_agen"])
            ws2.cell(r_idx, 6, s["cabang"])
            ws2.cell(r_idx, 7, s.get("lokasi", ""))
            ws2.cell(r_idx, 8, s["oct_trx"]).number_format = "#,##0.00"
            ws2.cell(r_idx, 9, s["nov_trx"]).number_format = "#,##0.00"
            ws2.cell(r_idx, 10, s["tgt_visit"]).number_format = "#,##0"
            ws2.cell(r_idx, 11, s["ach_visit"]).number_format = "#,##0"
            ws2.cell(r_idx, 12, s["ach_pct"]).number_format = "0.0%"
            ws2.cell(r_idx, 13, s["net_trx"]).number_format = "#,##0.00"
            ws2.cell(r_idx, 14, s["growth"]).number_format = "#,##0.00"
            c_status = ws2.cell(r_idx, 15, "BERHAK KLAIM" if s["is_claimable"] else "HANGUS")
            c_status.font = Font(bold=True, color="047857" if s["is_claimable"] else "DC2626")

        for c in range(1, 16):
            ws2.column_dimensions[get_column_letter(c)].width = 15
        ws2.column_dimensions["E"].width = 30

    os.makedirs(os.path.dirname(OUTPUT_KPI_EXCEL_PATH), exist_ok=True)
    wb.save(OUTPUT_KPI_EXCEL_PATH)
