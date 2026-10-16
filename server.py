"""
server.py — Entry point Web Report
Hanya berisi routing. Semua logic ada di engines/ dan pages/.
Jalankan: python server.py
"""

import os
import sys
import json
import uvicorn
import asyncio
from starlette.applications import Starlette
from starlette.responses import JSONResponse, HTMLResponse, FileResponse
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

import engines.transaction_engine as trx_engine
import engines.overview_engine as overview_engine
import engines.daily_engine as daily_engine
import engines.pivot_engine as pivot_engine
import engines.sco_engine as sco_engine
import engines.reseller_engine as reseller_engine
import engines.agen_engine as agen_engine
import engines.fisik_engine as fisik_engine
import engines.system_engine as system_engine
import engines.analisa_engine as analisa_engine
import engines.profit_engine as profit_engine
import engines.admin_engine as admin_engine
import engines.master_data_engine as master_data_engine
import engines.master_product_engine as master_product_engine
import engines.harga_engine as harga_engine

PAGES_DIR = os.path.join(BASE_DIR, "pages")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

# ─── Routes ──────────────────────────────────────────────────────────────────

async def homepage(request):
    shell_path = os.path.join(TEMPLATES_DIR, "shell.html")
    if os.path.exists(shell_path):
        with open(shell_path, "r", encoding="utf-8") as f:
            return HTMLResponse(
                f.read(),
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
            )
    return HTMLResponse("<h1>Web Report</h1><p>Shell belum ditemukan.</p>")


async def favicon(request):
    fav_path = os.path.join(BASE_DIR, "static", "img", "fav_icon.png")
    if os.path.exists(fav_path):
        return FileResponse(fav_path, media_type="image/png")
    return HTMLResponse("", status_code=204)


async def api_overview(request):
    """Data komputasi perbandingan Daily Transaksi Sukses per Cabang."""
    import importlib
    importlib.reload(overview_engine)
    year = request.query_params.get("year", "2026")
    force = request.query_params.get("force", "0") in ("1", "true")
    try:
        data = await asyncio.to_thread(overview_engine.calculate_daily_growth, year=year, force=force)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_daily_periods(request):
    """Daftar periode yang tersedia untuk brand."""
    if request.query_params.get("reload") == "1":
        import importlib
        importlib.reload(daily_engine)
    brand = request.query_params.get("brand", "ASTAGA").upper()
    periods = await asyncio.to_thread(daily_engine.get_available_periods, brand)
    return JSONResponse({"ok": True, "periods": periods})


async def api_daily(request):
    """Data komputasi lengkap Daily Summary Report."""
    import importlib
    importlib.reload(daily_engine)
    brand = request.query_params.get("brand", "ASTAGA").upper()
    curr = request.query_params.get("curr")
    prev = request.query_params.get("prev")
    try:
        data = await asyncio.to_thread(daily_engine.calculate_daily_report, brand=brand, curr_month=curr, prev_month=prev)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_pivot_options(request):
    """Opsi filter dan dimensi untuk Pivot Table (Channel / Product)."""
    if request.query_params.get("reload") == "1":
        import importlib
        import engines.metrics_engine as me
        importlib.reload(me)
        importlib.reload(pivot_engine)
    brand = request.query_params.get("brand", "ASTAGA").upper()
    year = request.query_params.get("year", "2026")
    piv_type = request.query_params.get("type", "channel").lower()
    try:
        opts = pivot_engine.get_options(brand=brand, year=year, pivot_type=piv_type)
        return JSONResponse({"ok": True, "data": opts})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_pivot_query(request):
    """Kalkulasi agregasi Pivot Table Dinamis (Channel / Product)."""
    if request.query_params.get("reload") == "1":
        import importlib
        import engines.metrics_engine as me
        importlib.reload(me)
        importlib.reload(pivot_engine)
    brand = request.query_params.get("brand", "ASTAGA").upper()
    year = request.query_params.get("year", "2026")
    row_dim = request.query_params.get("row", "cabang")
    col_dim = request.query_params.get("col", "none")
    metric = request.query_params.get("metric", "trx_count")
    month_filter = request.query_params.get("month", "ALL")
    status_filter = request.query_params.get("status", "ALL")
    cabang_filter = request.query_params.get("cabang", "ALL")
    kategori_filter = request.query_params.get("kategori", "ALL")
    operator_filter = request.query_params.get("operator", "ALL")
    limit = int(request.query_params.get("limit", "100"))
    try:
        res = pivot_engine.execute_pivot(
            brand=brand,
            year=year,
            row_dim=row_dim,
            col_dim=col_dim,
            metric=metric,
            month_filter=month_filter,
            status_filter=status_filter,
            cabang_filter=cabang_filter,
            kategori_filter=kategori_filter,
            operator_filter=operator_filter,
            top_limit=limit
        )
        return JSONResponse({"ok": True, "data": res})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_status(request):
    """Ringkasan status cache semua brand & tahun."""
    try:
        status = trx_engine.get_status()
        years  = {}
        for brand in trx_engine.BRAND_CONFIG:
            try:
                years[brand] = trx_engine.get_available_years(brand)
            except Exception:
                years[brand] = []
        return JSONResponse({
            "ok": True,
            "cache_status": status,
            "available_years": years,
        })
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_trx_build(request):
    """Bangun / rebuild cache parquet transaksi."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    year  = request.query_params.get("year", "2026")
    force = request.query_params.get("force", "0") == "1"

    if brand not in trx_engine.BRAND_CONFIG:
        return JSONResponse({"ok": False, "error": f"Brand tidak dikenal: {brand}"}, status_code=400)

    result = trx_engine.build_cache(brand, year, force=force)
    result["ok"] = result.get("success", False)
    return JSONResponse(result)


async def api_trx_summary(request):
    """Ringkasan cepat data transaksi dari cache."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    year  = request.query_params.get("year", "2026")
    try:
        df = trx_engine.load(brand, year)
        sukses = df[df["status"].astype(str).str.lower().str.contains("sukses", na=False)]
        return JSONResponse({
            "ok":           True,
            "brand":        brand,
            "year":         year,
            "total_rows":   len(df),
            "sukses":       len(sukses),
            "total_jual":   round(sukses["jual"].sum(), 0),
            "total_beli":   round(sukses["beli"].sum(), 0),
            "margin":       round(sukses["jual"].sum() - sukses["beli"].sum(), 0),
            "status_breakdown": df["status"].value_counts().to_dict(),
        })
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_sco_generate(request):
    """Generate ulang data_sco.json dari cache transaksi Parquet."""
    try:
        import importlib
        importlib.reload(sco_engine)
        res = await asyncio.to_thread(sco_engine.generate_sco_data)
        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_sco_push(request):
    """Push folder pages/sco ke GitHub Pages (https://github.com/depocell/SCO)."""
    try:
        import importlib
        importlib.reload(sco_engine)
        res = await asyncio.to_thread(sco_engine.push_to_github)
        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_sco_check(request):
    """Auto-check: jika data_sco.json stale → regenerate otomatis, else langsung ok."""
    try:
        import importlib
        importlib.reload(sco_engine)
        stale = await asyncio.to_thread(sco_engine.is_stale)
        
        # Opsi check_only untuk UI respon instan (< 0.05s)
        if request.query_params.get("check_only") == "1":
            return JSONResponse({"ok": True, "stale": stale})

        if not stale:
            return JSONResponse({"ok": True, "stale": False, "message": "Data SCO sudah up-to-date."})
        # Stale → auto regenerate
        res = await asyncio.to_thread(sco_engine.generate_sco_data)
        res["stale"] = True
        res["message"] = "Data SCO otomatis diperbarui."
        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_reseller(request):
    """Data komputasi profil & analisa customer/reseller ASTAGA / OKIPAY."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    month = request.query_params.get("month")
    year = request.query_params.get("year", "2026")
    try:
        data = await asyncio.to_thread(reseller_engine.calculate_reseller_dashboard, brand=brand, month_code=month, year=year)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_agen(request):
    """Data komputasi profil & analisa Level Agen Induk ASTAGA / OKIPAY (Rollup Reseller)."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    tab = request.query_params.get("tab")
    if tab == "tren":
        import importlib
        importlib.reload(agen_engine)
        force = request.query_params.get("force") == "1"
        try:
            data = await asyncio.to_thread(agen_engine.calculate_tren_agen, brand=brand, force=force)
            return JSONResponse(data)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

    month = request.query_params.get("month")
    year = request.query_params.get("year", "2026")
    try:
        data = await asyncio.to_thread(agen_engine.calculate_agen_dashboard, brand=brand, month_code=month, year=year)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_agen_tren(request):
    """Data tren transaksi harian agen ASTAGA / OKIPAY 1 tahun terakhir (12 bulan) dengan perbandingan YoY."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    force = request.query_params.get("force") == "1"
    try:
        import importlib
        importlib.reload(agen_engine)
        data = await asyncio.to_thread(agen_engine.calculate_tren_agen, brand=brand, force=force)
        return JSONResponse(data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_fisik(request):
    """Data laporan penjualan produk fisik & sales DSO dari rekapan SISCOM (.xls / .xlsx / .ttx)."""
    period = request.query_params.get("period")
    cabang = request.query_params.get("cabang", "ALL")
    channel = request.query_params.get("channel", "ALL")
    kategori = request.query_params.get("kategori", "ALL")
    try:
        import importlib
        importlib.reload(fisik_engine)
        data = await asyncio.to_thread(
            fisik_engine.get_fisik_dashboard,
            period_code=period,
            cabang_filter=cabang,
            channel_filter=channel,
            kategori_filter=kategori
        )
        return JSONResponse(data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_harga_pivot(request):
    """Pivot riwayat harga jual 6 bulan terakhir dari tiap produk sesuai kategorinya (FISIK / ASTAGA / OKIPAY)."""
    source = request.query_params.get("source", "FISIK")
    if request.query_params.get("reload") == "1":
        import importlib
        importlib.reload(harga_engine)
        harga_engine.clear_cache()
    try:
        data = await asyncio.to_thread(harga_engine.get_price_pivot, source=source)
        return JSONResponse(data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_system_info(request):
    """Informasi sistem, status cut-off data transaksi & audit kesehatan master file."""
    if request.query_params.get("reload") == "1":
        import importlib
        importlib.reload(system_engine)
    year = request.query_params.get("year", "2026")
    try:
        data = await asyncio.to_thread(system_engine.get_system_overview, year=year)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_analisa_data(request):
    """Data analitikal bulanan multi-tahun (2023 s/d 2026) untuk Dashboard Analisa (Chart Only)."""
    if request.query_params.get("reload") == "1":
        import importlib
        importlib.reload(analisa_engine)
    brand = request.query_params.get("brand", "ALL")
    year = request.query_params.get("year", "ALL")
    month = request.query_params.get("month", "ALL")
    kategori = request.query_params.get("kategori", "ALL")
    operator = request.query_params.get("operator", "ALL")
    tipe = request.query_params.get("tipe", "ALL")
    try:
        data = await asyncio.to_thread(
            analisa_engine.query_analisa_data,
            brand=brand, year=year, month=month,
            kategori=kategori, operator=operator, tipe=tipe
        )
        return JSONResponse(data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_analisa_profit(request):
    """Data analisa menyeluruh Revenue, Modal, Komisi Upline, dan Net Profit Server."""
    if request.query_params.get("reload") == "1":
        import importlib
        importlib.reload(profit_engine)
    brand = request.query_params.get("brand", "ASTAGA").upper()
    year = request.query_params.get("year", "2026")
    month = request.query_params.get("month")
    try:
        data = await asyncio.to_thread(profit_engine.calculate_profit_analysis, brand=brand, year=year, month_code=month)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_analisa_product_hierarchy(request):
    """Mengembalikan hierarki produk { brand: { kategori: { operator: [paket, ...] } } } langsung dari SQLite master_data.db."""
    try:
        data = await asyncio.to_thread(analisa_engine.get_product_hierarchy)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_status(request):
    """Informasi status raw data, cut-off watermark, dan radar deteksi file TSV incoming."""
    if request.query_params.get("reload") == "1":
        import importlib
        importlib.reload(admin_engine)
    year = request.query_params.get("year", "2026")
    try:
        data = admin_engine.get_admin_dashboard_data(year=year)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_upsert(request):
    """Memicu job background untuk conditional upsert file TSV ke Excel & Parquet."""
    try:
        body = await request.json()
        brand = body.get("brand", "ASTAGA").upper()
        delete_tsv = body.get("delete_tsv", True)
        year = body.get("year", "2026")
        
        job_id = admin_engine.start_upsert_job(brand=brand, delete_tsv=delete_tsv, year=year)
        return JSONResponse({"ok": True, "job_id": job_id, "message": f"Job upsert {brand} dimulai"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_job_status(request):
    """Mengecek progress dan log dari job upsert."""
    job_id = request.query_params.get("job_id", "")
    data = admin_engine.get_job_status(job_id)
    return JSONResponse({"ok": True, "data": data})


async def api_admin_sync_vps(request):
    """Sinkronisasi seluruh database SQLite dan cache transaksi Parquet ke VPS Helipod depas.my.id."""
    try:
        import engines.sync_vps_engine as sync_vps
        res = await asyncio.to_thread(sync_vps.sync_to_vps)
        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_agents(request):
    """Query daftar agen, statistik, dan opsi filter."""
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        cabang = request.query_params.get("cabang", "ALL")
        sco = request.query_params.get("sco", "ALL")
        type_val = request.query_params.get("type", "ALL")
        search = request.query_params.get("search", "")
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))
        
        result = master_data_engine.query_agents(
            brand=brand, cabang=cabang, sco=sco, type_val=type_val,
            search=search, page=page, page_size=page_size
        )
        options = master_data_engine.get_filter_options(brand=brand)
        return JSONResponse({"ok": True, "data": result, "options": options})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_agent_detail(request):
    """Mengambil detail profil agen dan daftar downline."""
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        agen_id = request.query_params.get("agen_id", "").strip().upper()
        if not agen_id:
            return JSONResponse({"ok": False, "error": "agen_id is required"}, status_code=400)
            
        data = master_data_engine.get_agent_detail(brand, agen_id)
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_agent_save(request):
    """Menyimpan pembaruan data agen (Cabang, SCO, DSO, Tipe, dll) dan menyinkronkan downlines."""
    try:
        body = await request.json()
        brand = body.get("brand", "ASTAGA").upper()
        agen_id = body.get("agen_id", "").strip().upper()
        data = body.get("data", {})
        if not agen_id:
            return JSONResponse({"ok": False, "error": "agen_id is required"}, status_code=400)
            
        res = master_data_engine.save_agent(brand, agen_id, data)
        reseller_engine.clear_master_meta_cache()
        reseller_engine.clear_reseller_dashboard_cache()
        agen_engine.clear_agen_dashboard_cache()
        return JSONResponse({"ok": True, "message": f"Agen {agen_id} berhasil disimpan!", "data": res})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_agent_export(request):
    """Mengekspor data master customer dan mapping agen ke file Excel."""
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        file_path = master_data_engine.export_master_excel(brand)
        filename = os.path.basename(file_path)
        return FileResponse(file_path, filename=filename, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_reseller_status(request):
    """Mengambil status deteksi file TSV Reseller di C:\\RAW DATA dan status sinkronisasi SQLite."""
    try:
        data = master_data_engine.get_reseller_radar_status()
        return JSONResponse({"ok": True, "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_reseller_sync(request):
    """Memicu sinkronisasi Reseller & Agen dari TSV terbaru di C:\\RAW DATA."""
    try:
        brand = "ALL"
        if request.method == "POST":
            try:
                body = await request.json()
                brand = body.get("brand", "ALL").upper()
            except Exception:
                brand = request.query_params.get("brand", "ALL").upper()
        else:
            brand = request.query_params.get("brand", "ALL").upper()

        res = master_data_engine.sync_resellers_from_tsv(brand)
        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_products(request):
    """Query daftar master produk, statistik, dan opsi filter."""
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        kategori = request.query_params.get("kategori", "ALL")
        operator = request.query_params.get("operator", "ALL")
        paket = request.query_params.get("paket", "ALL")
        search = request.query_params.get("search", "")
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 25))
        
        result = master_product_engine.query_products(
            brand=brand, kategori=kategori, operator=operator, paket=paket,
            search=search, page=page, page_size=page_size
        )
        options = master_product_engine.get_filter_options(brand=brand)
        return JSONResponse({"ok": True, "data": result, "options": options})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_product_detail(request):
    """Mengambil detail spesifik produk."""
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        kode_produk = request.query_params.get("kode_produk", "").strip().upper()
        if not kode_produk:
            return JSONResponse({"ok": False, "error": "kode_produk is required"}, status_code=400)
            
        data = master_product_engine.get_product_detail(brand, kode_produk)
        options = master_product_engine.get_filter_options(brand=brand)
        return JSONResponse({"ok": True, "data": data, "options": options})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_product_save(request):
    """Menyimpan atau memperbarui metadata produk (Kategori, Operator, Paket, Nama)."""
    try:
        body = await request.json()
        brand = body.get("brand", "ASTAGA").upper()
        kode_produk = body.get("kode_produk", "").strip().upper()
        data = body.get("data", {})
        if not kode_produk:
            return JSONResponse({"ok": False, "error": "kode_produk is required"}, status_code=400)
            
        res = master_product_engine.save_product(brand, kode_produk, data)
        return JSONResponse({"ok": True, "message": f"Produk {kode_produk} berhasil disimpan!", "data": res})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_product_export(request):
    """Mengekspor data master produk ke file Excel resmi."""
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        file_path = master_product_engine.export_product_excel(brand)
        filename = os.path.basename(file_path)
        return FileResponse(file_path, filename=filename, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ─── Routing ─────────────────────────────────────────────────────────────────

routes = [
    Route("/",                  homepage),
    Route("/favicon.ico",       favicon),
    Route("/api/overview",      api_overview),
    Route("/api/daily/periods", api_daily_periods),
    Route("/api/daily",         api_daily),
    Route("/api/pivot/options", api_pivot_options),
    Route("/api/pivot/query",   api_pivot_query),
    Route("/api/reseller",      api_reseller),
    Route("/api/agen/tren",     api_agen_tren),
    Route("/api/agen",          api_agen),
    Route("/api/fisik",         api_fisik),
    Route("/api/harga/pivot",   api_harga_pivot),
    Route("/api/system/info",   api_system_info),
    Route("/api/system-info",   api_system_info),
    Route("/api/admin/status",          api_admin_status),
    Route("/api/admin/upsert",          api_admin_upsert, methods=["POST"]),
    Route("/api/admin/job-status",      api_admin_job_status),
    Route("/api/admin/sync-vps",        api_admin_sync_vps, methods=["GET", "POST"]),
    Route("/api/admin/agents",          api_admin_agents),
    Route("/api/admin/agents/detail",    api_admin_agent_detail),
    Route("/api/admin/agents/save",      api_admin_agent_save, methods=["POST"]),
    Route("/api/admin/agents/export",    api_admin_agent_export),
    Route("/api/admin/reseller/status", api_admin_reseller_status),
    Route("/api/admin/reseller/sync",   api_admin_reseller_sync, methods=["GET", "POST"]),
    Route("/api/admin/products",        api_admin_products),
    Route("/api/admin/products/detail", api_admin_product_detail),
    Route("/api/admin/products/save",   api_admin_product_save, methods=["POST"]),
    Route("/api/admin/products/export", api_admin_product_export),
    Route("/api/analisa/data",   api_analisa_data),
    Route("/api/analisa",        api_analisa_data),
    Route("/api/analisa/overview", api_analisa_data),
    Route("/api/analisa/profit", api_analisa_profit),
    Route("/api/analisa/product-hierarchy", api_analisa_product_hierarchy),
    Route("/api/sco/generate",  api_sco_generate, methods=["GET", "POST"]),
    Route("/api/sco/push",      api_sco_push,     methods=["GET", "POST"]),
    Route("/api/sco/check",     api_sco_check,    methods=["GET", "POST"]),
    Route("/api/status",        api_status),
    Route("/api/trx/build",     api_trx_build,   methods=["GET", "POST"]),
    Route("/api/trx/summary",   api_trx_summary),
    Mount("/pages",             app=StaticFiles(directory=PAGES_DIR), name="pages"),
    Mount("/static",            app=StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static"),
    Mount("/data",              app=StaticFiles(directory=os.path.join(BASE_DIR, "data")), name="data"),
]

app = Starlette(debug=True, routes=routes)

# ─── Prewarm ─────────────────────────────────────────────────────────────────

def _prewarm():
    """Pre-warm cache saat server boot (background thread): Parquet, RAM & Master."""
    import threading, time
    import engines.customer_engine as cust_engine
    import engines.product_engine as prod_engine
    import engines.reseller_engine as res_engine

    def run():
        time.sleep(1)
        print("[BOOT] Pre-warming cache transaksi & RAM 2026...")
        for brand in ["ASTAGA", "OKIPAY"]:
            # 1. Pastikan parquet valid
            trx_engine.build_cache(brand, "2026")
            # 2. Muat langsung ke RAM (_MEMORY_CACHE) dengan kolom ym & is_sukses
            trx_engine.load(brand, "2026")
            # 3. Preload master customer & produk
            cust_engine.get_ar_to_cabang(brand)
            prod_engine.get_product_map(brand)
            # Preload pivot prepared transactions
            pivot_engine.get_prepared_trx(brand, "2026")

        # 0. Periksa radar TSV Reseller baru di C:\RAW DATA (Auto-Sync jika ada file baru)
        try:
            radar = master_data_engine.get_reseller_radar_status()
            for b in ["ASTAGA", "OKIPAY"]:
                if radar.get(b, {}).get("needs_sync"):
                    fn = radar.get(b, {}).get("tsv", {}).get("filename", "")
                    print(f"[BOOT] Terdeteksi TSV Reseller baru {fn} ({b}), auto-sync & filter < 2023...")
                    master_data_engine.sync_resellers_from_tsv(b)
        except Exception as e:
            print(f"[BOOT] Gagal auto-sync TSV Reseller: {e}")

        # 4. Preload reseller meta
        res_engine.load_master_meta()

        # 5. Precompute dashboard Reseller, Agen, System, dan Admin di background RAM
        try:
            print("[BOOT] Pre-computing Dashboard Reseller, Agen, System & Admin 2026...")
            res_engine.calculate_reseller_dashboard(year="2026")
            import engines.agen_engine as ag_engine
            ag_engine.calculate_agen_dashboard(year="2026")
            system_engine.get_system_overview(year="2026")
            admin_engine.get_admin_dashboard_data(year="2026")
            profit_engine.calculate_profit_analysis(brand="ASTAGA", year="2026")
            profit_engine.calculate_profit_analysis(brand="OKIPAY", year="2026")
            profit_engine.calculate_profit_analysis(brand="ALL", year="2026")
        except Exception as e:
            print(f"[BOOT] Gagal pre-compute dashboard: {e}")

        print("[BOOT] Pre-warm RAM & Master selesai! Semua engine siap sat-set.")

    threading.Thread(target=run, daemon=True).start()


def _open_browser():
    """Buka browser otomatis saat server sudah siap."""
    import threading, time, webbrowser
    def run():
        time.sleep(1.2)
        try:
            webbrowser.open("http://localhost:8000")
        except Exception:
            pass
    threading.Thread(target=run, daemon=True).start()


if __name__ == "__main__":
    _prewarm()
    _open_browser()
    print("Server berjalan di http://localhost:8000 (Membuka browser otomatis...)")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
