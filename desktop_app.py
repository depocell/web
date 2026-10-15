"""
Web Report - Desktop App Launcher (pywebview)
---------------------------------------------
Menjalankan Web Report Depo Cell sebagai aplikasi desktop native (Edge WebView2).
- Server backend FastAPI dijalankan otomatis di background daemon thread.
- Ketika jendela desktop ditutup (tombol X), seluruh proses server otomatis berhenti (0 orphan process).
- Fitur DevTools (Inspect Element / Console) aktif via klik kanan jika debug=True.
- Kompatibel dengan python.exe (mode console) dan pythonw.exe (mode silent/windowed).
"""

import sys
import os
import time
import socket
import threading

# Proteksi stdout/stderr saat dijalankan via pythonw.exe (tanpa console window)
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

import uvicorn
import webview

# Aktifkan perizinan download file di pywebview / Edge WebView2
webview.settings['ALLOW_DOWNLOADS'] = True

HOST = "127.0.0.1"
PORT = 8000

def is_port_in_use(host: str, port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False

import urllib.request

def wait_for_server(host: str, port: int, timeout: float = 10.0) -> bool:
    start = time.time()
    url = f"http://{host}:{port}/"
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=0.8) as response:
                if response.status in (200, 302, 304, 404):
                    return True
        except Exception:
            pass
        time.sleep(0.15)
    return False

def run_server(host: str, port: int):
    try:
        # Import FastAPI app dari server.py
        from server import app
        config = uvicorn.Config(
            app=app,
            host=host,
            port=port,
            log_level="warning",
            access_log=False
        )
        server = uvicorn.Server(config)
        server.run()
    except Exception as e:
        print(f"[Desktop App] Gagal menjalankan server backend: {e}")

def main():
    target_port = PORT
    server_already_running = is_port_in_use(HOST, target_port)

    if not server_already_running:
        print(f"[Desktop App] Memulai background server di http://{HOST}:{target_port} ...")
        t = threading.Thread(target=run_server, args=(HOST, target_port), daemon=True)
        t.start()
        if not wait_for_server(HOST, target_port):
            print("[Desktop App] Timeout menunggu server siap!")
    else:
        print(f"[Desktop App] Server backend sudah aktif di http://{HOST}:{target_port}.")

    url = f"http://{HOST}:{target_port}"
    print(f"[Desktop App] Membuka jendela aplikasi desktop ({url}) ...")

    # Icon path: Windows pywebview (.NET) WAJIB file .ico valid
    base_dir = os.path.dirname(os.path.abspath(__file__))
    icon_path = os.path.join(base_dir, "static", "img", "app_icon.ico")
    if not os.path.exists(icon_path):
        icon_path = None

    # Buat jendela pywebview
    window = webview.create_window(
        title="Web Report - Depo Cell",
        url=url,
        width=1400,
        height=850,
        min_size=(1024, 600),
        text_select=True,
        zoomable=True
    )

    def on_closed():
        print("[Desktop App] Jendela ditutup. Menghentikan semua proses...")
        # Pastikan tidak ada thread gantung yang tertinggal
        os._exit(0)

    window.events.closed += on_closed

    # Default debug=False agar tampilan bersih seperti aplikasi desktop biasa (tanpa pop-up DevTools).
    # Jika suatu saat butuh inspect DevTools, jalankan via: python desktop_app.py --debug
    enable_debug = "--debug" in sys.argv
    try:
        webview.start(debug=enable_debug, icon=icon_path)
    except Exception as e:
        print(f"[Desktop App] Gagal start dengan icon ({e}), mencoba tanpa icon...")
        webview.start(debug=enable_debug, icon=None)

if __name__ == "__main__":
    main()
