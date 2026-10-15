# export_static.py — Generator snapshot data statis untuk GitHub Pages
import os
import json
import engines.overview_engine as oe
import engines.daily_engine as de
import engines.profit_engine as pe
import engines.agen_engine as ae
import engines.reseller_engine as re
import engines.fisik_engine as fe
import engines.admin_engine as adme
import engines.system_engine as se

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUT_DIR, exist_ok=True)

def export_all():
    print("[1/7] Exporting Overview...")
    d_ov = oe.calculate_daily_growth(year="2026")
    with open(os.path.join(OUT_DIR, "overview.json"), "w", encoding="utf-8") as f:
        json.dump({"ok": True, "data": d_ov}, f)

    print("[2/7] Exporting Daily Summary...")
    for brand in ["ASTAGA", "OKIPAY"]:
        b_lower = brand.lower()
        periods = de.get_available_periods(brand)
        with open(os.path.join(OUT_DIR, f"daily_periods_{b_lower}.json"), "w", encoding="utf-8") as f:
            json.dump({"ok": True, "periods": periods}, f)
        if periods:
            d_daily = de.calculate_daily_report(brand, periods[0]["curr"], periods[0]["prev"])
            with open(os.path.join(OUT_DIR, f"daily_{b_lower}.json"), "w", encoding="utf-8") as f:
                json.dump({"ok": True, "data": d_daily}, f)

    print("[3/7] Exporting Profit Analysis...")
    for brand in ["ASTAGA", "OKIPAY", "ALL"]:
        b_lower = brand.lower()
        res = pe.calculate_profit_analysis(brand=brand, year="2026")
        with open(os.path.join(OUT_DIR, f"analisa_profit_{b_lower}.json"), "w", encoding="utf-8") as f:
            json.dump({"ok": True, "data": res}, f)

    print("[3b/7] Exporting Analisa Module & Supplier...")
    import engines.analisa_engine as ane
    for brand in ["ASTAGA", "OKIPAY", "ALL"]:
        b_lower = brand.lower()
        d_an = ane.query_analisa_data(brand=brand, year="ALL", month="ALL")
        with open(os.path.join(OUT_DIR, f"analisa_{b_lower}.json"), "w", encoding="utf-8") as f:
            json.dump({"ok": True, **d_an}, f)

    print("[4/7] Exporting Agen & Reseller...")
    for brand in ["ASTAGA", "OKIPAY"]:
        b_lower = brand.lower()
        ag = ae.calculate_agen_dashboard(brand=brand, year="2026")
        with open(os.path.join(OUT_DIR, f"agen_{b_lower}.json"), "w", encoding="utf-8") as f:
            json.dump({"ok": True, "data": ag}, f)
        res = re.calculate_reseller_dashboard(brand=brand, year="2026")
        with open(os.path.join(OUT_DIR, f"reseller_{b_lower}.json"), "w", encoding="utf-8") as f:
            json.dump({"ok": True, "data": res}, f)
        tren = ae.calculate_tren_agen(brand)
        with open(os.path.join(OUT_DIR, f"agen_tren_{b_lower}.json"), "w", encoding="utf-8") as f:
            json.dump(tren, f)

    print("[5/7] Exporting Produk Fisik...")
    d_fisik = fe.get_fisik_dashboard()
    with open(os.path.join(OUT_DIR, "fisik.json"), "w", encoding="utf-8") as f:
        json.dump(d_fisik, f)

    print("[6/7] Exporting Admin Status & System Info...")
    adm = adme.get_admin_dashboard_data(year="2026")
    with open(os.path.join(OUT_DIR, "admin_status.json"), "w", encoding="utf-8") as f:
        json.dump({"ok": True, "data": adm}, f)

    sys_info = se.get_system_overview(year="2026")
    with open(os.path.join(OUT_DIR, "system_info.json"), "w", encoding="utf-8") as f:
        json.dump({"ok": True, "data": sys_info}, f)

    print("[7/7] Selesai! Semua file statis berhasil disimpan di folder data/.")

if __name__ == "__main__":
    export_all()
