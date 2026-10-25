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
from starlette.responses import JSONResponse, HTMLResponse, FileResponse, RedirectResponse, Response, PlainTextResponse, StreamingResponse
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

import engines.auth_engine as auth_engine
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
import engines.survey_engine as survey_engine
import engines.fraud_engine as fraud_engine

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


# ─── Autentikasi & Akses Lapangan SCO ─────────────────────────────────────────

def is_local_request(request) -> bool:
    """Mengecek apakah request berasal dari workstation lokal (desktop WebView2 / localhost)."""
    host_header = request.headers.get("host", "").lower()
    # Jika diakses via domain resmi atau IP publik VPS, pasti ONLINE
    if "depas.my.id" in host_header or "45.66.153.150" in host_header:
        return False
    # Jika lewat reverse proxy nginx (ada header x-forwarded), pasti ONLINE
    if request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip"):
        return False
    client_host = request.client.host if request.client else ""
    return client_host in ("127.0.0.1", "localhost", "::1")


async def page_login(request):
    """Menampilkan halaman login manajemen."""
    if is_local_request(request):
        return RedirectResponse("/", status_code=302)
    token = request.cookies.get("depas_session")
    valid, _, _ = auth_engine.verify_session_token(token)
    if valid:
        return RedirectResponse("/", status_code=302)

    login_path = os.path.join(TEMPLATES_DIR, "login.html")
    if os.path.exists(login_path):
        with open(login_path, "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    return HTMLResponse("<h1>Login Page Not Found</h1>", status_code=404)


async def api_auth_login(request):
    """Memproses login akun manajemen via JSON."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Format request tidak valid"}, status_code=400)

    username = str(body.get("username", "")).strip()
    password = str(body.get("password", "")).strip()
    remember_me = bool(body.get("remember_me", True))

    ok, res = auth_engine.verify_login(username, password)
    if not ok:
        return JSONResponse({"ok": False, "error": res}, status_code=401)

    role = res.get("role", "tamu")
    token = auth_engine.create_session_token(username, role=role, remember_me=remember_me)
    max_age = auth_engine.SESSION_DURATION_LONG if remember_me else auth_engine.SESSION_DURATION_SHORT

    response = JSONResponse({"ok": True, "user": res, "message": "Login berhasil"})
    is_secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        key="depas_session",
        value=token,
        max_age=max_age,
        path="/",
        httponly=True,
        samesite="lax",
        secure=is_secure
    )
    return response


async def api_auth_logout(request):
    """Logout akun dan redirect ke halaman login."""
    response = RedirectResponse("/login", status_code=302)
    response.delete_cookie("depas_session", path="/")
    return response


async def api_auth_status(request):
    """Cek status login pengguna saat ini beserta role-nya."""
    if is_local_request(request):
        return JSONResponse({"ok": True, "authenticated": True, "is_local": True, "username": "Admin (Lokal)", "role": "admin"})
    token = request.cookies.get("depas_session")
    valid, username, role = auth_engine.verify_session_token(token)
    return JSONResponse({
        "ok": True,
        "authenticated": valid,
        "is_local": False,
        "username": username if valid else None,
        "role": role if valid else "guest"
    })


async def api_admin_users_list(request):
    """Mengembalikan daftar semua user untuk manajemen akun."""
    token = request.cookies.get("depas_session")
    valid, username, role = auth_engine.verify_session_token(token)
    if not is_local_request(request) and (not valid or role != "admin"):
        return JSONResponse({"ok": False, "error": "Akses khusus Administrator"}, status_code=403)
    users = auth_engine.list_users()
    return JSONResponse({"ok": True, "users": users})


async def api_admin_users_create(request):
    """Menambah user baru (Admin / Tamu)."""
    token = request.cookies.get("depas_session")
    valid, username, role = auth_engine.verify_session_token(token)
    if not is_local_request(request) and (not valid or role != "admin"):
        return JSONResponse({"ok": False, "error": "Akses khusus Administrator"}, status_code=403)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Format request tidak valid"}, status_code=400)

    u_name = str(body.get("username", "")).strip()
    u_pwd = str(body.get("password", "")).strip()
    u_role = str(body.get("role", "tamu")).strip().lower()

    ok, msg = auth_engine.create_user(u_name, u_pwd, u_role)
    return JSONResponse({"ok": ok, "message" if ok else "error": msg}, status_code=200 if ok else 400)


async def api_admin_users_password(request):
    """Reset password user oleh Admin."""
    token = request.cookies.get("depas_session")
    valid, username, role = auth_engine.verify_session_token(token)
    if not is_local_request(request) and (not valid or role != "admin"):
        return JSONResponse({"ok": False, "error": "Akses khusus Administrator"}, status_code=403)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Format request tidak valid"}, status_code=400)

    u_name = str(body.get("username", "")).strip()
    new_pwd = str(body.get("new_password", "")).strip()

    ok, msg = auth_engine.admin_reset_password(u_name, new_pwd)
    return JSONResponse({"ok": ok, "message" if ok else "error": msg}, status_code=200 if ok else 400)


async def api_admin_users_delete(request):
    """Hapus user oleh Admin."""
    token = request.cookies.get("depas_session")
    valid, current_user, role = auth_engine.verify_session_token(token)
    if not is_local_request(request) and (not valid or role != "admin"):
        return JSONResponse({"ok": False, "error": "Akses khusus Administrator"}, status_code=403)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Format request tidak valid"}, status_code=400)

    u_name = str(body.get("username", "")).strip()
    curr_admin = current_user or "admin"

    ok, msg = auth_engine.delete_user(u_name, current_admin=curr_admin)
    return JSONResponse({"ok": ok, "message" if ok else "error": msg}, status_code=200 if ok else 400)



async def api_admin_tickets_list(request):
    """Mengembalikan daftar tiket eskalasi AI (Help Me Please) ke Data Center."""
    tkt_index_path = os.path.join(BASE_DIR, "pages", "analisa", "tickets", "tickets_index.json")
    tickets = []
    if os.path.exists(tkt_index_path):
        try:
            with open(tkt_index_path, "r", encoding="utf-8") as f:
                tickets = json.load(f)
        except Exception:
            tickets = []
    total = len(tickets)
    pending = sum(1 for t in tickets if t.get("status") == "PENDING")
    resolved = sum(1 for t in tickets if t.get("status") == "RESOLVED")
    return JSONResponse({
        "ok": True,
        "tickets": tickets,
        "total": total,
        "pending": pending,
        "resolved": resolved
    })


async def api_admin_tickets_resolve(request):
    """Menandai tiket eskalasi sebagai RESOLVED."""
    try:
        body = await request.json()
        ticket_id = body.get("ticket_id")
        note = body.get("note", "Data sudah diracik dan disuntikkan ke snapshot AI.")
        if not ticket_id:
            return JSONResponse({"ok": False, "error": "ticket_id wajib diisi"}, status_code=400)
            
        tkt_dir = os.path.join(BASE_DIR, "pages", "analisa", "tickets")
        tkt_file = os.path.join(tkt_dir, f"{ticket_id}.json")
        if os.path.exists(tkt_file):
            try:
                with open(tkt_file, "r", encoding="utf-8") as f:
                    t_data = json.load(f)
                t_data["status"] = "RESOLVED"
                t_data["resolution_note"] = note
                with open(tkt_file, "w", encoding="utf-8") as f:
                    json.dump(t_data, f, ensure_ascii=False, indent=2)
            except Exception:
                pass
                
        # Update index
        index_file = os.path.join(tkt_dir, "tickets_index.json")
        if os.path.exists(index_file):
            try:
                with open(index_file, "r", encoding="utf-8") as f:
                    idx = json.load(f)
                for item in idx:
                    if item.get("ticket_id") == ticket_id:
                        item["status"] = "RESOLVED"
                        item["resolution_note"] = note
                        break
                with open(index_file, "w", encoding="utf-8") as f:
                    json.dump(idx, f, ensure_ascii=False, indent=2)
            except Exception:
                pass
                
        return JSONResponse({"ok": True, "message": f"Tiket {ticket_id} berhasil diselesaikan!"})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_auth_change_password(request):
    """Mengubah password akun manajemen."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Format request tidak valid"}, status_code=400)

    token = request.cookies.get("depas_session")
    valid, session_user, _ = auth_engine.verify_session_token(token)
    username = session_user if valid else body.get("username", "admin")

    old_password = body.get("old_password", "")
    new_password = body.get("new_password", "")

    ok, msg = auth_engine.change_password(username, old_password, new_password)
    return JSONResponse({"ok": ok, "message" if ok else "error": msg})


async def page_sco_redirect(request):
    """Direct standalone URL untuk tim sales lapangan ke SCO Performance Suite."""
    return RedirectResponse(url="/pages/sco/index.html", status_code=302)


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
    mode = request.query_params.get("mode", "operational").lower()
    try:
        opts = pivot_engine.get_options(brand=brand, year=year, pivot_type=piv_type, mode=mode)
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

    body = {}
    if request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            body = {}

    params = request.query_params
    brand = (body.get("brand") or params.get("brand", "ASTAGA")).upper()
    year = body.get("year") or params.get("year", "2026")
    row_dim = body.get("row_dim") or body.get("row") or params.get("row", "cabang")
    col_dim = body.get("col_dim") or body.get("col") or params.get("col", "none")
    metric = body.get("metric") or params.get("metric", "trx_count")
    month_filter = body.get("month_filter") or body.get("month") or params.get("month", "ALL")
    status_filter = body.get("status_filter") or body.get("status") or params.get("status", "ALL")
    cabang_filter = body.get("cabang_filter") or body.get("cabang") or params.get("cabang", "ALL")
    kategori_filter = body.get("kategori_filter") or body.get("kategori") or params.get("kategori", "ALL")
    operator_filter = body.get("operator_filter") or body.get("operator") or params.get("operator", "ALL")
    limit = int(body.get("top_limit") or body.get("limit") or params.get("limit", "100"))
    mode = str(body.get("mode") or params.get("mode", "operational")).lower()
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
            top_limit=limit,
            mode=mode
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


async def api_fraud_analysis(request):
    """Data analisa fraud & self-transaction reseller (top-up e-wallet ke nomor sendiri)."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    month = request.query_params.get("month")
    year = request.query_params.get("year", "2026")
    sco = request.query_params.get("sco")
    cabang = request.query_params.get("cabang")
    q = request.query_params.get("q")
    try:
        data = await asyncio.to_thread(
            fraud_engine.calculate_fraud_analysis,
            brand=brand, year=year, month_code=month,
            sco_filter=sco, cabang_filter=cabang, search_q=q
        )
        return JSONResponse(data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_fraud_detail(request):
    """Detail transaksi individual self-transaction reseller untuk modal drilldown."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    month = request.query_params.get("month")
    year = request.query_params.get("year", "2026")
    kode_reseller = request.query_params.get("kode_reseller")
    try:
        data = await asyncio.to_thread(
            fraud_engine.get_reseller_fraud_detail,
            brand=brand, year=year, month_code=month, kode_reseller=kode_reseller
        )
        return JSONResponse(data)
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


async def api_survey_candidates(request):
    """Mengambil daftar seluruh agen churn yang siap disurvey lengkap dengan kontak WA."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    month = request.query_params.get("month")
    year = request.query_params.get("year", "2026")
    try:
        data = await asyncio.to_thread(survey_engine.get_survey_candidates, brand=brand, month_code=month, year=year)
        return JSONResponse(data)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_survey_preview(request):
    """Generate preview teks sapaan personalisasi AI untuk agen churn."""
    try:
        body = await request.json()
        brand = body.get("brand", "ASTAGA").upper()
        candidate = body.get("candidate", {})
        msg = survey_engine.generate_survey_message(candidate, brand=brand)
        return JSONResponse({"ok": True, "message": msg})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_survey_send(request):
    """Mengeksekusi pengiriman pesan survey (mendukung mode uji coba ke nomor tes)."""
    try:
        body = await request.json()
        brand = body.get("brand", "ASTAGA").upper()
        periode = body.get("periode", "2026-10")
        agen_id = body.get("agen_id")
        agen_name = body.get("agen_name", "")
        cabang = body.get("cabang", "-")
        sco_name = body.get("sco_name", "-")
        no_wa = body.get("no_wa", "")
        prev_trx = int(body.get("prev_trx", 0))
        message_text = body.get("message", "")
        is_test = bool(body.get("is_test", False))
        test_target_phone = body.get("test_phone")

        res = await asyncio.to_thread(
            survey_engine.record_survey_send,
            brand=brand,
            periode=periode,
            agen_id=agen_id,
            agen_name=agen_name,
            cabang=cabang,
            sco_name=sco_name,
            no_wa=no_wa,
            prev_trx=prev_trx,
            message_text=message_text,
            is_test=is_test,
            test_target_phone=test_target_phone
        )
        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_survey_reply(request):
    """Mencatat balasan agen dan menjalankan klasifikasi intent/sentimen AI."""
    try:
        body = await request.json()
        log_id = int(body.get("log_id"))
        reply_text = body.get("reply_text", "")
        res = await asyncio.to_thread(survey_engine.record_survey_reply, log_id=log_id, reply_text=reply_text)
        return JSONResponse(res)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_survey_incoming_wa(request):
    """Menerima webhook pesan masuk dari WhatsApp Gateway."""
    try:
        body = await request.json()
        phone = body.get("phone", "")
        text = body.get("text", "")
        res = await asyncio.to_thread(survey_engine.process_incoming_wa_webhook, phone=phone, text=text)
        return JSONResponse(res)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_survey_logs(request):
    """Mengambil riwayat log survey yang pernah dikirim dan dibalas."""
    brand = request.query_params.get("brand", "ASTAGA").upper()
    periode = request.query_params.get("periode")
    try:
        logs = await asyncio.to_thread(survey_engine.get_survey_history, brand=brand, periode=periode)
        return JSONResponse({"ok": True, "logs": logs})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_survey_log_delete(request):
    """Menghapus satu baris log survey atau seluruh log."""
    try:
        body = await request.json()
        log_id = body.get("id")
        clear_all = body.get("clear_all", False)
        brand = body.get("brand", "ASTAGA").upper()
        periode = body.get("periode")

        if clear_all:
            res = await asyncio.to_thread(survey_engine.clear_all_survey_logs, brand=brand, periode=periode)
            return JSONResponse(res)

        if not log_id:
            return JSONResponse({"ok": False, "error": "ID log wajib diisi"}, status_code=400)

        res = await asyncio.to_thread(survey_engine.delete_survey_log, log_id=int(log_id))
        return JSONResponse(res)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_survey_gateway_status(request):
    """Status WhatsApp: Mode Direct wa.me resmi aktif."""
    return JSONResponse({
        "ok": True,
        "connected": True,
        "mode": "wa.me",
        "phone": "Direct wa.me",
        "label": "Mode Aman: Direct WhatsApp (wa.me)"
    })


async def api_survey_check_phones(request):
    """Mengecek format nomor WhatsApp untuk daftar nomor (batch)."""
    try:
        body = await request.json()
        phones = body.get("phones", [])
        if not phones:
            return JSONResponse({"ok": True, "results": {}})

        results = {}
        for p in phones:
            clean = survey_engine.clean_phone_number(p)
            results[p] = bool(clean and len(clean) >= 10)
        return JSONResponse({"ok": True, "results": results})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e), "results": {}})


async def api_survey_update_primary_phone(request):
    """Mengupdate nomor WhatsApp utama reseller saat nomor alternatif terverifikasi aktif."""
    try:
        body = await request.json()
        kode_reseller = body.get("kode_reseller")
        active_phone = body.get("active_phone")
        res = survey_engine.update_reseller_primary_wa(kode_reseller, active_phone)
        return JSONResponse(res)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_survey_reset_session(request):
    """Menghapus sesi WhatsApp lama agar siap scan nomor baru."""
    import shutil
    session_dir = os.path.join(BASE_DIR, "wa_gateway", "session")
    try:
        if os.path.exists(session_dir):
            shutil.rmtree(session_dir, ignore_errors=True)
        return JSONResponse({"ok": True, "message": "Sesi WhatsApp berhasil direset. Silakan restart gateway untuk scan QR baru."})
    except Exception as e:
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


async def api_admin_upload_tsv(request):
    """Menerima upload file TSV OtomaX secara langsung dari browser/admin UI,
    melakukan pembersihan data, deduplikasi trx_id, dan upsert ke file Parquet."""
    try:
        form = await request.form()
        brand = form.get("brand", "ASTAGA").upper()
        uploaded_file = form.get("file")
        if not uploaded_file:
            return JSONResponse({"ok": False, "error": "File TSV tidak ditemukan dalam form upload."}, status_code=400)

        upload_dir = os.path.join(BASE_DIR, ".cache", "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        filename = getattr(uploaded_file, "filename", None) or f"upload_{brand}.tsv"
        temp_path = os.path.join(upload_dir, filename)

        contents = await uploaded_file.read()
        with open(temp_path, "wb") as f:
            f.write(contents)

        res = await asyncio.to_thread(admin_engine.upsert_direct_to_parquet, brand=brand, tsv_file_path=temp_path)

        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass

        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_admin_upload_reseller_tsv(request):
    """Menerima upload file TSV Master Reseller OtomaX (astaga.tsv / okipay.tsv),
    menjalankan migrasi hierarki, update database SQLite, dan refresh cache Parquet/Stream."""
    try:
        import time
        form = await request.form()
        brand = form.get("brand", "ASTAGA").upper()
        uploaded_file = form.get("file")
        if not uploaded_file:
            return JSONResponse({"ok": False, "error": "File TSV Reseller tidak ditemukan dalam form upload."}, status_code=400)

        upload_dir = os.path.join(BASE_DIR, ".cache", "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        filename = getattr(uploaded_file, "filename", None) or f"reseller_{brand}.tsv"
        temp_path = os.path.join(upload_dir, filename)

        contents = await uploaded_file.read()
        with open(temp_path, "wb") as f:
            f.write(contents)

        def _do_migration():
            t0 = time.time()
            if brand == "ASTAGA":
                res = master_data_engine.migrate_astaga(tsv_path=temp_path)
            else:
                res = master_data_engine.migrate_okipay(tsv_path=temp_path)
            res["elapsed_sec"] = round(time.time() - t0, 2)
            return res

        res = await asyncio.to_thread(_do_migration)

        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass

        return JSONResponse(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_export_transactions_parquet(request):
    """Menyediakan file Parquet mentah teroptimasi untuk konsumsi Power BI Desktop (From Web / Parquet).
    Mendukung unduhan Full 1 Tahun atau Spesifik Bulanan (misal: 2026-10).
    Query Params:
    - brand: ASTAGA / OKIPAY (default: ASTAGA)
    - year: 2026 (default: 2026)
    - month: format YYYY-MM (misal: 2026-10) atau ALL (default: ALL)
    - key: depas2026
    """
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        year = request.query_params.get("year", "2026")
        month = request.query_params.get("month", "").strip()

        parquet_path = trx_engine._cache_path(brand, year)
        if not os.path.exists(parquet_path):
            return JSONResponse({"ok": False, "error": f"File Parquet untuk {brand} {year} belum tersedia di server."}, status_code=404)

        if not month or month.upper() == "ALL":
            return FileResponse(
                parquet_path,
                media_type="application/octet-stream",
                filename=f"trx_{brand.lower()}_{year}.parquet"
            )

        cache_dir = os.path.join(BASE_DIR, ".cache", "export")
        os.makedirs(cache_dir, exist_ok=True)
        monthly_parquet_path = os.path.join(cache_dir, f"trx_{brand.lower()}_{month}.parquet")
        out_filename = f"trx_{brand.lower()}_{month}.parquet"

        is_fresh = False
        if os.path.exists(monthly_parquet_path):
            if os.path.getmtime(monthly_parquet_path) >= os.path.getmtime(parquet_path) and os.path.getsize(monthly_parquet_path) > 0:
                is_fresh = True

        if is_fresh:
            return FileResponse(
                monthly_parquet_path,
                media_type="application/octet-stream",
                filename=out_filename
            )

        def _build_monthly_parquet():
            df = trx_engine.load(brand, year)
            if df is None or len(df) == 0:
                return parquet_path
            s_tgl = df["tgl_entry"].astype(str)
            df_m = df[s_tgl.str.startswith(month)]
            temp_path = monthly_parquet_path + f".tmp_{os.getpid()}"
            df_m.to_parquet(temp_path, index=False, compression="snappy", coerce_timestamps="ms", allow_truncated_timestamps=True)
            if os.path.exists(temp_path):
                import shutil
                shutil.move(temp_path, monthly_parquet_path)
            return monthly_parquet_path

        await asyncio.to_thread(_build_monthly_parquet)

        return FileResponse(
            monthly_parquet_path,
            media_type="application/octet-stream",
            filename=out_filename
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


async def api_export_transactions_csv(request):
    """Menyediakan data transaksi dalam format CSV Stream untuk Excel Power Query (From Web / CSV).
    Menyimpan file CSV terkompilasi di disk (.cache/export/) agar respon instan (0.01 detik)
    dan Power Query tidak pernah timeout.
    Query Params:
    - brand: ASTAGA / OKIPAY (default: ASTAGA)
    - year: 2026 (default: 2026)
    - month: format YYYY-MM (misal: 2026-10) atau ALL (default: ALL)
    - status: Sukses / Gagal / ALL (default: ALL)
    - key: depas2026
    """
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        year = request.query_params.get("year", "2026")
        month = request.query_params.get("month", "").strip()
        status_filter = request.query_params.get("status", "ALL").strip().lower()

        cache_dir = os.path.join(BASE_DIR, ".cache", "export")
        os.makedirs(cache_dir, exist_ok=True)

        m_tag = month.lower() if month and month.upper() != "ALL" else "all"
        cache_filename = f"trx_{brand.lower()}_{year}_{m_tag}_{status_filter}.csv"
        cache_path = os.path.join(cache_dir, cache_filename)
        out_filename = f"trx_{brand.lower()}_{month if month and month.upper() != 'ALL' else year}.csv"

        parquet_path = trx_engine._cache_path(brand, year)

        # Cek apakah file CSV di disk sudah ada dan valid (tidak lebih lawas dari parquet)
        is_fresh = False
        if os.path.exists(cache_path) and os.path.exists(parquet_path):
            if os.path.getmtime(cache_path) >= os.path.getmtime(parquet_path) and os.path.getsize(cache_path) > 0:
                is_fresh = True

        if is_fresh:
            return FileResponse(
                cache_path,
                media_type="text/csv",
                filename=out_filename
            )

        # Jika belum ada atau usang karena baru di-upsert, buat file CSV di disk
        def _build_csv():
            df = trx_engine.load(brand, year)
            if df is None or len(df) == 0:
                with open(cache_path, "w", encoding="utf-8") as f:
                    f.write("trx_id,tgl_entry,product_id,qty,ar_id,modul_id,status,tgl_stat,beli,jual\n")
                return cache_path

            if month and month.upper() != "ALL":
                s_tgl = df["tgl_entry"].astype(str)
                df = df[s_tgl.str.startswith(month)]

            if status_filter and status_filter != "all":
                df = df[df["status"].astype(str).str.lower() == status_filter]

            cols = [c for c in ["trx_id", "tgl_entry", "product_id", "qty", "ar_id", "modul_id", "status", "tgl_stat", "beli", "jual"] if c in df.columns]

            temp_path = cache_path + f".tmp_{os.getpid()}"
            df[cols].to_csv(temp_path, index=False, date_format="%Y-%m-%d %H:%M:%S")
            if os.path.exists(temp_path):
                import shutil
                shutil.move(temp_path, cache_path)
            return cache_path

        await asyncio.to_thread(_build_csv)

        return FileResponse(
            cache_path,
            media_type="text/csv",
            filename=out_filename
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return PlainTextResponse(f"Error generating CSV: {str(e)}", status_code=500)


async def api_export_agents_csv(request):
    """Menyediakan tabel dimensi Toko Induk (Master Agen Langsung) dalam format CSV Stream.
    Query Params:
    - brand: ASTAGA / OKIPAY (default: ASTAGA)
    - key: depas2026
    """
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        
        def _get_agents():
            import sqlite3
            import pandas as pd
            db_path = os.path.join(BASE_DIR, "MASTER", "master_data.db")
            conn = sqlite3.connect(db_path)
            query = """
                SELECT agen_id, nama_agen, cabang, type, sco, dso, limit_saldo, markup, 
                       tgl_daftar, tgl_aktivitas_terakhir, jadwal, location, kota_kab, kecamatan, kelurahan
                FROM agents
                WHERE brand = ?
                ORDER BY agen_id
            """
            df = pd.read_sql_query(query, conn, params=(brand,))
            conn.close()
            return df.to_csv(index=False)

        csv_data = await asyncio.to_thread(_get_agents)
        filename = f"master_agen_{brand.lower()}.csv"
        return Response(
            csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return PlainTextResponse(f"Error generating agents CSV: {str(e)}", status_code=500)


async def api_export_customers_csv(request):
    """Menyediakan tabel dimensi Customer (Reseller & Agen Induk) dalam format CSV Stream
    untuk relasi di Power BI / Excel Power Query (Dimension Table: Dim_Customer).
    Query Params:
    - brand: ASTAGA / OKIPAY (default: ASTAGA)
    - key: depas2026
    """
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        
        def _get_customers():
            import sqlite3
            import pandas as pd
            db_path = os.path.join(BASE_DIR, "MASTER", "master_data.db")
            conn = sqlite3.connect(db_path)
            query = """
                SELECT r.kode_reseller, r.nama_reseller, r.grup, r.kode_upline, r.root_agen_id, 
                       r.cabang, r.leveling, a.nama_agen AS nama_root_agen, a.type, a.sco, 
                       r.limit_saldo, r.markup
                FROM resellers r
                LEFT JOIN agents a ON r.root_agen_id = a.agen_id AND r.brand = a.brand
                WHERE r.brand = ?
                ORDER BY r.kode_reseller
            """
            df = pd.read_sql_query(query, conn, params=(brand,))
            conn.close()
            return df.to_csv(index=False)

        csv_data = await asyncio.to_thread(_get_customers)
        filename = f"master_customer_{brand.lower()}.csv"
        return Response(
            csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return PlainTextResponse(f"Error generating customers CSV: {str(e)}", status_code=500)


async def api_export_products_csv(request):
    """Menyediakan tabel dimensi Produk (Master Produk, Kategori, Operator, Paket) dalam format CSV Stream
    untuk relasi di Power BI / Excel Power Query (Dimension Table: Dim_Product).
    Query Params:
    - brand: ASTAGA / OKIPAY (default: ASTAGA)
    - key: depas2026
    """
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        
        def _get_products():
            import sqlite3
            import pandas as pd
            db_path = os.path.join(BASE_DIR, "MASTER", "master_data.db")
            conn = sqlite3.connect(db_path)
            query = """
                SELECT kode_produk, nama_produk, kategori, operator, paket
                FROM products
                WHERE brand = ?
                ORDER BY kode_produk
            """
            df = pd.read_sql_query(query, conn, params=(brand,))
            conn.close()
            return df.to_csv(index=False)

        csv_data = await asyncio.to_thread(_get_products)
        filename = f"master_product_{brand.lower()}.csv"
        return Response(
            csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return PlainTextResponse(f"Error generating products CSV: {str(e)}", status_code=500)


async def api_export_finance_rekap(request):
    """Menyediakan file Excel Rekap Bulanan Finance (2 Sheet: Transaksi Bersih & Transaksi All)
    Query Params:
    - brand: ASTAGA / OKIPAY (default: ASTAGA)
    - year: 2026 (default: 2026)
    - month: format YYYY-MM (misal: 2026-10) atau ALL (default: latest)
    - key: depas2026
    """
    try:
        brand = request.query_params.get("brand", "ASTAGA").upper()
        year = request.query_params.get("year", "2026")
        month = request.query_params.get("month", "").strip()

        file_path = await asyncio.to_thread(admin_engine.generate_finance_monthly_excel, brand, year, month)
        filename = os.path.basename(file_path)
        return FileResponse(
            file_path,
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return PlainTextResponse(f"Error generating Finance Excel: {str(e)}", status_code=500)


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


async def api_system_pulse(request):
    """Live Server Pulse & Telemetry Status + terminal log stream."""
    import engines.telemetry_engine as telemetry_engine
    return JSONResponse(telemetry_engine.get_telemetry())


# ─── Auth Middleware ─────────────────────────────────────────────────────────

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # 1. Workstation desktop lokal bebas login total
        if is_local_request(request):
            return await call_next(request)

        path = request.url.path

        # Whitelist token key untuk Data Stream (Power BI / Excel Power Query)
        export_key = request.query_params.get("key", "")
        if path.startswith("/api/export/") and export_key in ("depas2026", "secret_export_token"):
            return await call_next(request)

        # 2. Whitelist rute publik:
        # - Halaman login & endpoint auth
        # - Akses langsung tim sales lapangan ke SCO Suite (/sco, /pages/sco/*, /api/sco/*)
        # - File statis (CSS, JS, logo, font)
        # - Telemetry status pulse
        # - Favicon
        if (
            path == "/login" or
            path.startswith("/api/auth/") or
            path == "/api/system/pulse" or
            path == "/sco" or
            path.startswith("/sco/") or
            path.startswith("/pages/sco") or
            path.startswith("/api/sco") or
            path.startswith("/static/") or
            path == "/favicon.ico"
        ):
            return await call_next(request)

        # 3. Validasi token sesi untuk seluruh rute internal lainnya
        token = request.cookies.get("depas_session")
        valid, username, role = auth_engine.verify_session_token(token)
        if valid:
            # 3a. Role-Based Access Control (RBAC):
            # Jika user adalah 'tamu' (non-admin), blokir akses ke dapur admin & finansial
            if role != "admin":
                if (
                    path.startswith("/api/admin/") or 
                    path.startswith("/pages/admin") or
                    path.startswith("/pages/daily") or
                    path.startswith("/pages/sco")
                ):
                    if path.startswith("/api/"):
                        return JSONResponse(
                            {"ok": False, "error": "Akses ditolak. Fitur ini khusus Administrator."},
                            status_code=403
                        )
                    return RedirectResponse("/#overview", status_code=302)

                if path == "/api/analisa/profit":
                    return JSONResponse(
                        {"ok": False, "error": "Akses ditolak. Analisa profit & laba khusus Administrator."},
                        status_code=403
                    )

            return await call_next(request)

        # 4. Jika unauthenticated:
        if path.startswith("/api/"):
            return JSONResponse(
                {"ok": False, "error": "Akses ditolak. Sesi tidak ditemukan atau telah kedaluwarsa. Silakan login terlebih dahulu."},
                status_code=401
            )

        # Jika buka halaman web: redirect ke /login
        next_url = str(request.url.path)
        if request.url.query:
            next_url += f"?{request.url.query}"
        return RedirectResponse(f"/login?next={next_url}", status_code=302)


# ─── Routing ─────────────────────────────────────────────────────────────────

routes = [
    Route("/",                          homepage),
    Route("/login",                     page_login),
    Route("/sco",                       page_sco_redirect),
    Route("/sco/",                      page_sco_redirect),
    Route("/favicon.ico",               favicon),
    Route("/api/auth/login",            api_auth_login, methods=["POST"]),
    Route("/api/auth/logout",           api_auth_logout, methods=["GET", "POST"]),
    Route("/api/auth/status",           api_auth_status),
    Route("/api/auth/change-password",  api_auth_change_password, methods=["POST"]),
    Route("/api/overview",      api_overview),
    Route("/api/daily/periods", api_daily_periods),
    Route("/api/daily",         api_daily),
    Route("/api/pivot/options", api_pivot_options),
    Route("/api/pivot/query",   api_pivot_query, methods=["GET", "POST"]),
    Route("/api/reseller",      api_reseller),
    Route("/api/reseller/fraud",        api_fraud_analysis),
    Route("/api/reseller/fraud/detail", api_fraud_detail),
    Route("/api/agen/tren",     api_agen_tren),
    Route("/api/agen",          api_agen),
    Route("/api/survey/candidates", api_survey_candidates),
    Route("/api/survey/preview",    api_survey_preview,    methods=["POST"]),
    Route("/api/survey/send",       api_survey_send,       methods=["POST"]),
    Route("/api/survey/reply",      api_survey_reply,      methods=["POST"]),
    Route("/api/survey/incoming-wa", api_survey_incoming_wa, methods=["POST"]),
    Route("/api/survey/logs",       api_survey_logs),
    Route("/api/survey/logs/delete", api_survey_log_delete, methods=["POST"]),
    Route("/api/survey/check-phones", api_survey_check_phones, methods=["POST"]),
    Route("/api/survey/update-primary-phone", api_survey_update_primary_phone, methods=["POST"]),
    Route("/api/survey/gateway-status", api_survey_gateway_status),
    Route("/api/survey/reset-session",  api_survey_reset_session, methods=["POST"]),
    Route("/api/fisik",         api_fisik),
    Route("/api/harga/pivot",   api_harga_pivot),
    Route("/api/system/info",   api_system_info),
    Route("/api/system-info",   api_system_info),
    Route("/api/admin/status",          api_admin_status),
    Route("/api/admin/upsert",          api_admin_upsert, methods=["POST"]),
    Route("/api/admin/job-status",      api_admin_job_status),
    Route("/api/admin/sync-vps",        api_admin_sync_vps, methods=["GET", "POST"]),
    Route("/api/admin/upload-tsv",       api_admin_upload_tsv, methods=["POST"]),
    Route("/api/admin/upload-reseller-tsv", api_admin_upload_reseller_tsv, methods=["POST"]),
    Route("/api/export/transactions.csv", api_export_transactions_csv),
    Route("/api/export/transactions.parquet", api_export_transactions_parquet),
    Route("/api/export/customers.csv",    api_export_customers_csv),
    Route("/api/export/agents.csv",       api_export_agents_csv),
    Route("/api/export/products.csv",     api_export_products_csv),
    Route("/api/export/finance-rekap.xlsx", api_export_finance_rekap),
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
    Route("/api/admin/users",           api_admin_users_list),
    Route("/api/admin/users/create",    api_admin_users_create, methods=["POST"]),
    Route("/api/admin/users/password",  api_admin_users_password, methods=["POST"]),
    Route("/api/admin/users/delete",    api_admin_users_delete, methods=["POST"]),
    Route("/api/admin/tickets",         api_admin_tickets_list),
    Route("/api/admin/tickets/resolve", api_admin_tickets_resolve, methods=["POST"]),
    Route("/api/analisa/data",   api_analisa_data),
    Route("/api/analisa",        api_analisa_data),
    Route("/api/analisa/overview", api_analisa_data),
    Route("/api/analisa/profit", api_analisa_profit),
    Route("/api/analisa/product-hierarchy", api_analisa_product_hierarchy),
    Route("/api/sco/generate",  api_sco_generate, methods=["GET", "POST"]),
    Route("/api/sco/push",      api_sco_push,     methods=["GET", "POST"]),
    Route("/api/sco/check",     api_sco_check,    methods=["GET", "POST"]),
    Route("/api/status",        api_status),
    Route("/api/system/pulse",  api_system_pulse),
    Route("/api/trx/build",     api_trx_build,   methods=["GET", "POST"]),
    Route("/api/trx/summary",   api_trx_summary),
    Mount("/pages",             app=StaticFiles(directory=PAGES_DIR), name="pages"),
    Mount("/static",            app=StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static"),
]

app = Starlette(debug=True, routes=routes)
app.add_middleware(AuthMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ─── Prewarm ─────────────────────────────────────────────────────────────────

def _prewarm():
    """Pre-warm cache saat server boot (background thread): Parquet, RAM & Master."""
    import threading, time
    import engines.customer_engine as cust_engine
    import engines.product_engine as prod_engine
    import engines.reseller_engine as res_engine
    import engines.telemetry_engine as telemetry_engine

    def run():
        time.sleep(1)
        telemetry_engine.set_busy("Boot Pre-warm Cache 2026...", "Memeriksa Parquet & RAM")
        print("[BOOT] Pre-warming cache transaksi & RAM 2026...")
        for brand in ["ASTAGA", "OKIPAY"]:
            # 1. Pastikan parquet valid
            telemetry_engine.set_busy(f"Pre-warm Parquet {brand} 2026...", "Cek integritas file")
            trx_engine.build_cache(brand, "2026")
            # 2. Muat langsung ke RAM (_MEMORY_CACHE) dengan kolom ym & is_sukses
            telemetry_engine.set_busy(f"Pre-warm RAM {brand} 2026...", "Memuat dataset ke memori")
            trx_engine.load(brand, "2026")
            # 3. Preload master customer & produk
            telemetry_engine.set_busy(f"Pre-load Master {brand}...", "Customer & Product Map")
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
                    telemetry_engine.set_busy(f"Auto-sync TSV Reseller {b}...", fn)
                    print(f"[BOOT] Terdeteksi TSV Reseller baru {fn} ({b}), auto-sync & filter < 2023...")
                    master_data_engine.sync_resellers_from_tsv(b)
        except Exception as e:
            telemetry_engine.log(f"[BOOT] Gagal auto-sync TSV: {e}", state="warning")
            print(f"[BOOT] Gagal auto-sync TSV Reseller: {e}")

        # 4. Preload reseller meta
        telemetry_engine.set_busy("Pre-load Master Reseller Meta...", "SQLite & Hierarchy")
        res_engine.load_master_meta()

        # 5. Precompute dashboard Reseller, Agen, System, dan Admin di background RAM
        try:
            telemetry_engine.set_busy("Pre-computing Dashboards 2026...", "Reseller, Agen, System, Profit")
            print("[BOOT] Pre-computing Dashboard Reseller, Agen, System & Admin 2026...")
            res_engine.calculate_reseller_dashboard(year="2026")
            import engines.agen_engine as ag_engine
            ag_engine.calculate_agen_dashboard(year="2026")
            system_engine.get_system_overview(year="2026")
            admin_engine.get_admin_dashboard_data(year="2026")
            profit_engine.calculate_profit_analysis(brand="ASTAGA", year="2026")
            profit_engine.calculate_profit_analysis(brand="OKIPAY", year="2026")
            profit_engine.calculate_profit_analysis(brand="ALL", year="2026")
            import engines.analisa_engine as an_engine
            an_engine.get_analisa_dataset()
            an_engine.query_analisa_data(brand="ASTAGA", year="ALL", month="ALL")
            an_engine.query_analisa_data(brand="OKIPAY", year="ALL", month="ALL")
            an_engine.query_analisa_data(brand="ALL", year="ALL", month="ALL")
        except Exception as e:
            telemetry_engine.log(f"[BOOT] Gagal pre-compute dashboard: {e}", state="warning")
            print(f"[BOOT] Gagal pre-compute dashboard: {e}")

        telemetry_engine.set_idle("Server Ready — Parquet & SQLite Sinkron", "RAM Cache Aktif & Sat-set")
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
