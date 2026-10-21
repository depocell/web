"""
scripts/import_reseller_contacts.py
Mengimpor data kontak dari C:\DEPASMYID\RESELLER\ (KONTAK_ASTAGA.tsv dan KONTAK_OKIPAY.tsv)
ke tabel reseller_contacts di MASTER/master_data.db dengan aturan:
1. Hanya reseller AKTIF (yang ada di tabel 'resellers' master_data.db) yang disimpan. Akun zombie dibuang.
2. Menyimpan multi-nomor unik dalam kolom 'candidate_phones' (JSON).
3. Memilih nomor default 'no_wa' secara cerdas (prioritas: Jabber/WA yang juga terdaftar di SMS).
"""

import os
import csv
import re
import json
import sqlite3
from collections import defaultdict
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "MASTER", "master_data.db")
DIR_DEPAS = r"C:\DEPASMYID\RESELLER"

def clean_phone(raw):
    if not raw:
        return None
    s = str(raw).strip()
    s = re.sub(r'@\.?c\.us$', '', s, flags=re.IGNORECASE)
    s = s.replace('+', '').replace('-', '').replace(' ', '').replace('.', '')
    s = re.sub(r'[^0-9]', '', s)
    if not s:
        return None
    if s.startswith('08'):
        s = '628' + s[2:]
    elif s.startswith('8'):
        s = '628' + s[1:]
    return s if s.startswith('628') and len(s) >= 10 else None

def main():
    print(f"=== [1/4] Connecting to {DB_PATH} ===")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Pastikan kolom candidate_phones ada di tabel reseller_contacts
    cur.execute("PRAGMA table_info(reseller_contacts)")
    cols = [r[1] for r in cur.fetchall()]
    if "candidate_phones" not in cols:
        print("Menambahkan kolom 'candidate_phones' ke reseller_contacts...")
        cur.execute("ALTER TABLE reseller_contacts ADD COLUMN candidate_phones TEXT;")
        conn.commit()

    # Ambil seluruh reseller aktif (>= 2023)
    cur.execute("SELECT kode_reseller, nama_reseller, brand FROM resellers")
    active_resellers = {row[0].strip().upper(): (row[1], row[2]) for row in cur.fetchall()}
    print(f"Total reseller aktif di master_data.db: {len(active_resellers):,} akun")

    # Map penampung: rs_code -> dict
    contacts_map = defaultdict(lambda: {
        "name": "",
        "brand": "",
        "wa_candidates": [],
        "sms_candidates": [],
        "all_unique": []
    })

    # Baca KONTAK_ASTAGA.tsv
    path_astaga = os.path.join(DIR_DEPAS, "KONTAK_ASTAGA.tsv")
    if os.path.exists(path_astaga):
        print(f"=== [2/4] Membaca {path_astaga} ===")
        with open(path_astaga, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f, delimiter='\t')
            header = next(reader, None)
            for row in reader:
                if len(row) < 3:
                    continue
                tipe, raw_phone, rs_code = row[0].strip(), row[1].strip(), row[2].strip().upper()
                rs_name = row[3].strip() if len(row) > 3 else ""

                if rs_code not in active_resellers:
                    continue  # Buang akun zombie

                p = clean_phone(raw_phone)
                if not p:
                    continue

                entry = contacts_map[rs_code]
                entry["brand"] = "ASTAGA"
                if not entry["name"] and rs_name:
                    entry["name"] = rs_name

                if p not in entry["all_unique"]:
                    entry["all_unique"].append(p)

                if tipe in ('G', 'W') and p not in entry["wa_candidates"]:
                    entry["wa_candidates"].append(p)
                elif tipe == 'S' and p not in entry["sms_candidates"]:
                    entry["sms_candidates"].append(p)

    # Baca KONTAK_OKIPAY.tsv
    path_okipay = os.path.join(DIR_DEPAS, "KONTAK_OKIPAY.tsv")
    if os.path.exists(path_okipay):
        print(f"=== [3/4] Membaca {path_okipay} ===")
        with open(path_okipay, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f, delimiter='\t')
            header = next(reader, None)
            for row in reader:
                if len(row) < 4:
                    continue
                tipe, raw_phone, rs_code = row[1].strip(), row[2].strip(), row[3].strip().upper()
                rs_name = row[4].strip() if len(row) > 4 else ""

                if rs_code not in active_resellers:
                    continue  # Buang akun zombie

                p = clean_phone(raw_phone)
                if not p:
                    continue

                entry = contacts_map[rs_code]
                entry["brand"] = "OKIPAY"
                if not entry["name"] and rs_name:
                    entry["name"] = rs_name

                if p not in entry["all_unique"]:
                    entry["all_unique"].append(p)

                if tipe in ('G', 'W') and p not in entry["wa_candidates"]:
                    entry["wa_candidates"].append(p)
                elif tipe == 'S' and p not in entry["sms_candidates"]:
                    entry["sms_candidates"].append(p)

    print(f"Total reseller aktif yang memiliki kontak: {len(contacts_map):,} akun")

    # Siapkan data batch insert/replace
    print("=== [4/4] Menyimpan ke database SQLite (reseller_contacts) ===")
    # Hapus data kontak lama agar bersih dari akun zombie
    cur.execute("DELETE FROM reseller_contacts;")
    
    now_str = datetime.now().isoformat()
    rows_to_insert = []

    for rs_code, info in contacts_map.items():
        name = info["name"] or active_resellers[rs_code][0] or rs_code
        all_unique = info["all_unique"]
        wa_cands = info["wa_candidates"]
        sms_cands = info["sms_candidates"]

        # Prioritas pemilihan no_wa awal:
        # 1. Nomor yang ada di wa_candidates DAN ada di sms_candidates (paling kuat kepemilikannya)
        intersection = [p for p in wa_cands if p in sms_cands]
        if intersection:
            primary_wa = intersection[0]
        elif wa_cands:
            primary_wa = wa_cands[0]
        elif all_unique:
            primary_wa = all_unique[0]
        else:
            primary_wa = None

        primary_sms = sms_cands[0] if sms_cands else (all_unique[0] if all_unique else None)
        channel = "WHATSAPP" if wa_cands else "SMS"
        candidates_json = json.dumps(all_unique)

        rows_to_insert.append((
            rs_code,
            name,
            primary_wa,
            primary_sms,
            channel,
            "TSV_MULTI_IMPORT",
            candidates_json,
            now_str
        ))

    cur.executemany(
        """
        INSERT OR REPLACE INTO reseller_contacts (
            kode_reseller, nama_reseller, no_wa, no_sms,
            primary_channel, source, candidate_phones, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows_to_insert
    )
    conn.commit()

    # Verifikasi contoh AR02460
    cur.execute("SELECT * FROM reseller_contacts WHERE kode_reseller = 'AR02460'")
    sample = cur.fetchone()
    print("\nVerifikasi NOVAL CELL (AR02460):")
    print(sample)

    cur.execute("SELECT COUNT(*) FROM reseller_contacts")
    final_count = cur.fetchone()[0]
    print(f"\nSUKSES! Total data reseller_contacts tersimpan: {final_count:,} baris.")
    conn.close()

if __name__ == "__main__":
    main()
