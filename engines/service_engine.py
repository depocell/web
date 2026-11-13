"""
engines/service_engine.py
Pengontrol Layanan Latar Belakang (Cloudflare Tunnel & AI Assistant Bot).
Menyediakan status realtime, start, stop, dan auto-reconnect untuk kontrol cepat side menu.
"""

import os
import sys
import subprocess
import ctypes
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)

TUNNEL_PID_FILE = os.path.join(CACHE_DIR, "tunnel.pid")
AI_PID_FILE = os.path.join(CACHE_DIR, "ai.pid")
LAPTOP_AGENT_PID_FILE = r"C:\LAPTOP_AGENT\agent.pid"

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
NO_WINDOW = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0


def _is_pid_alive(pid: int) -> bool:
    """Mengecek apakah process ID masih hidup secara instan via Windows API (<0.1ms)."""
    if not pid or pid <= 0:
        return False
    PROCESS_QUERY_INFORMATION = 0x0400
    try:
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_INFORMATION, False, int(pid))
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
    except Exception:
        pass
    return False


def _read_pid_file(path: str) -> int:
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content.isdigit():
                    return int(content)
        except Exception:
            pass
    return None


def _write_pid_file(path: str, pid: int):
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(str(pid))
    except Exception:
        pass


def _remove_pid_file(path: str):
    if os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass


def is_tunnel_running() -> bool:
    """Mengecek apakah Cloudflare Tunnel aktif."""
    # 1. Cek cloudflared.exe langsung via tasklist cepat (<40ms)
    try:
        res = subprocess.run(["tasklist", "/FI", "IMAGENAME eq cloudflared.exe"], capture_output=True, text=True, timeout=2, creationflags=NO_WINDOW)
        if "cloudflared.exe" in res.stdout:
            return True
    except Exception:
        pass

    # 2. Cek PID file python scripts/tunnel.py
    pid = _read_pid_file(TUNNEL_PID_FILE)
    if pid and _is_pid_alive(pid):
        return True

    return False


def is_ai_running() -> bool:
    """Mengecek apakah AI Assistant (agent.py atau tele_bot.py) aktif."""
    # 1. Cek PID file di .cache/ai.pid
    pid = _read_pid_file(AI_PID_FILE)
    if pid and _is_pid_alive(pid):
        return True

    # 2. Cek PID file di C:\LAPTOP_AGENT\agent.pid
    pid_laptop = _read_pid_file(LAPTOP_AGENT_PID_FILE)
    if pid_laptop and _is_pid_alive(pid_laptop):
        _write_pid_file(AI_PID_FILE, pid_laptop)
        return True

    # 3. Fallback: deteksi langsung via CIM proses Windows
    try:
        cmd = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.py*' -or $_.CommandLine -like '*tele_bot.py*' } | Select-Object -ExpandProperty ProcessId"
        proc = subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, text=True, timeout=5, creationflags=NO_WINDOW)
        out = proc.stdout.strip()
        if out:
            for line in out.splitlines():
                p_str = line.strip()
                if p_str.isdigit():
                    pid_found = int(p_str)
                    if _is_pid_alive(pid_found):
                        _write_pid_file(AI_PID_FILE, pid_found)
                        return True
    except Exception:
        pass

    return False


def get_services_status() -> dict:
    """Mengambil status gabungan Tunnel & AI."""
    t_status = is_tunnel_running()
    a_status = is_ai_running()
    return {
        "ok": True,
        "tunnel": {
            "running": t_status,
            "domain": "depas.my.id",
            "name": "Cloudflare Tunnel"
        },
        "ai": {
            "running": a_status,
            "bot": "@ompasha_bot",
            "name": "AI Assistant"
        }
    }


def start_tunnel() -> bool:
    """Menyalakan Cloudflare Tunnel."""
    if is_tunnel_running():
        return True
    script_path = os.path.join(BASE_DIR, "scripts", "tunnel.py")
    if not os.path.exists(script_path):
        return False
    try:
        p = subprocess.Popen(
            [sys.executable, script_path],
            cwd=BASE_DIR,
            creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | NO_WINDOW,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True
        )
        _write_pid_file(TUNNEL_PID_FILE, p.pid)
        return True
    except Exception as e:
        print(f"[ERROR] Gagal menyalakan tunnel: {e}")
        return False


def stop_tunnel() -> bool:
    """Mematikan Cloudflare Tunnel."""
    pid = _read_pid_file(TUNNEL_PID_FILE)
    if pid:
        try:
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True, creationflags=NO_WINDOW)
        except Exception:
            pass
        _remove_pid_file(TUNNEL_PID_FILE)

    # Pastikan cloudflared.exe juga tertutup
    try:
        subprocess.run(["taskkill", "/F", "/IM", "cloudflared.exe"], capture_output=True, creationflags=NO_WINDOW)
    except Exception:
        pass

    # Bersihkan sisa script tunnel jika ada
    try:
        cmd = "Get-CimInstance Win32_Process -Filter \"Name = 'python.exe'\" | Where-Object { $_.CommandLine -like '*tunnel.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
        subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, timeout=3, creationflags=NO_WINDOW)
    except Exception:
        pass

    return True


def start_ai() -> bool:
    """Menyalakan AI Assistant."""
    if is_ai_running():
        return True

    # Prioritas 1: C:\LAPTOP_AGENT\agent.py (@ompasha_bot)
    laptop_agent = r"C:\LAPTOP_AGENT\agent.py"
    if os.path.exists(laptop_agent):
        try:
            p = subprocess.Popen(
                [sys.executable, "agent.py"],
                cwd=r"C:\LAPTOP_AGENT",
                creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | NO_WINDOW,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True
            )
            _write_pid_file(AI_PID_FILE, p.pid)
            return True
        except Exception as e:
            print(f"[ERROR] Gagal start agent.py: {e}")

    # Prioritas 2: tele_bot.py di WEB REPORT
    tele_path = os.path.join(BASE_DIR, "tele_bot.py")
    if os.path.exists(tele_path):
        try:
            p = subprocess.Popen(
                [sys.executable, "tele_bot.py"],
                cwd=BASE_DIR,
                creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | NO_WINDOW,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True
            )
            _write_pid_file(AI_PID_FILE, p.pid)
            return True
        except Exception as e:
            print(f"[ERROR] Gagal start tele_bot.py: {e}")

    return False


def stop_ai() -> bool:
    """Mematikan AI Assistant."""
    pid = _read_pid_file(AI_PID_FILE)
    if pid:
        try:
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True, creationflags=NO_WINDOW)
        except Exception:
            pass
        _remove_pid_file(AI_PID_FILE)

    _remove_pid_file(LAPTOP_AGENT_PID_FILE)

    try:
        cmd = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.py*' -or $_.CommandLine -like '*tele_bot.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
        subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, timeout=5, creationflags=NO_WINDOW)
    except Exception:
        pass

    return True
