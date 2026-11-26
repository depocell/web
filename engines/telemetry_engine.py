"""
engines/telemetry_engine.py — Live Server Pulse & Activity Monitor
-------------------------------------------------------------------
Merekam status live server (Idle/Busy), aktivitas pembacaan file Excel, 
komputasi Parquet, pre-warm RAM cache, dan riwayat terminal log secara in-memory.
"""

import time
from datetime import datetime
from collections import deque
import threading
import sys
import os
import json
import subprocess

_LOCK = threading.Lock()
_START_TIME = time.time()

# Buffer terminal log (maksimal 100 baris terbaru)
_LOG_BUFFER = deque(maxlen=100)

_CURRENT_STATUS = {
    "state": "idle",  # "idle" | "busy" | "success" | "warning" | "error"
    "action": "Server Ready - Parquet & SQLite Sinkron",
    "detail": "RAM Cache Aktif",
    "progress": None,
    "last_updated": datetime.now().strftime("%H:%M:%S")
}

_CACHED_VPS_TELEMETRY = None
_LAST_VPS_FETCH_TIME = 0
_VPS_FETCH_IN_PROGRESS = False


def _fetch_vps_telemetry_background():
    """Background worker untuk mengupdate telemetri VPS secara non-blocking."""
    global _CACHED_VPS_TELEMETRY, _LAST_VPS_FETCH_TIME, _VPS_FETCH_IN_PROGRESS
    if _VPS_FETCH_IN_PROGRESS:
        return
    _VPS_FETCH_IN_PROGRESS = True
    try:
        import engines.sync_vps_engine as sync_vps
        res = sync_vps.get_vps_status()
        if res.get("ok"):
            _CACHED_VPS_TELEMETRY = res
            _LAST_VPS_FETCH_TIME = time.time()
    except Exception:
        pass
    finally:
        _VPS_FETCH_IN_PROGRESS = False


def get_header_telemetry():
    """Mengembalikan metrik RAM, CPU, dan Restart untuk topbar header."""
    is_linux = sys.platform.startswith("linux")

    # 1. JIKA DI LINUX (VPS depas.my.id)
    if is_linux:
        ram_total_mb = 0
        ram_used_mb = 0
        ram_pct = 0.0
        try:
            meminfo = {}
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    parts = line.split(":")
                    if len(parts) == 2:
                        key = parts[0].strip()
                        val = int(parts[1].split()[0])
                        meminfo[key] = val
            tot_kb = meminfo.get("MemTotal", 0)
            avail_kb = meminfo.get("MemAvailable", meminfo.get("MemFree", 0))
            ram_total_mb = tot_kb // 1024
            ram_used_mb = (tot_kb - avail_kb) // 1024
            if ram_total_mb > 0:
                ram_pct = round(ram_used_mb / ram_total_mb * 100, 1)
        except Exception:
            pass

        cpu_pct = 0.0
        try:
            load1, _, _ = os.getloadavg()
            cpu_pct = round(load1 * 100 / max(os.cpu_count() or 1, 1), 1)
        except Exception:
            pass

        restarts = 0
        webreport_r = 0
        depotpulsa_r = 0
        try:
            out = subprocess.check_output(["pm2", "jlist"], timeout=2).decode("utf-8")
            pm2_data = json.loads(out)
            for p in pm2_data:
                name = p.get("name", "")
                r = p.get("pm2_env", {}).get("restart_time", 0)
                if name == "webreport":
                    webreport_r = r
                elif name == "depotpulsa":
                    depotpulsa_r = r
            restarts = webreport_r + depotpulsa_r
        except Exception:
            pass

        uptime_str = "-"
        try:
            with open("/proc/uptime", "r") as f:
                up_sec = int(float(f.readline().split()[0]))
                d = up_sec // 86400
                h = (up_sec % 86400) // 3600
                m = (up_sec % 3600) // 60
                uptime_str = f"{d}d {h}h" if d > 0 else f"{h}h {m}m"
        except Exception:
            pass

        return {
            "ok": True,
            "host": "VPS depas.my.id",
            "ram": {
                "used_mb": ram_used_mb,
                "total_mb": ram_total_mb,
                "pct": ram_pct,
                "display": f"{ram_used_mb} MB ({round(ram_pct)}%)" if ram_total_mb < 2000 else f"{round(ram_used_mb/1024, 1)}G / {round(ram_total_mb/1024, 1)}G ({round(ram_pct)}%)",
                "status": "critical" if ram_pct >= 90 else ("warning" if ram_pct >= 75 else "normal")
            },
            "cpu": {
                "pct": cpu_pct,
                "display": f"{cpu_pct}%",
                "status": "critical" if cpu_pct >= 85 else ("warning" if cpu_pct >= 65 else "normal")
            },
            "restart": {
                "count": restarts,
                "webreport": webreport_r,
                "depotpulsa": depotpulsa_r,
                "uptime": uptime_str,
                "display": f"{restarts}x",
                "status": "warning" if restarts > 0 else "normal"
            }
        }

    # 2. JIKA DI WINDOWS (Workstation Lokal)
    # Cek apakah ada data cache dari VPS
    global _CACHED_VPS_TELEMETRY, _LAST_VPS_FETCH_TIME
    if _CACHED_VPS_TELEMETRY and _CACHED_VPS_TELEMETRY.get("ok"):
        v_sys = _CACHED_VPS_TELEMETRY.get("system", {})
        v_pm2 = _CACHED_VPS_TELEMETRY.get("pm2", [])

        web_r = 0
        pulsa_r = 0
        cpu_sum = 0.0
        for p in v_pm2:
            name = p.get("name", "")
            r = p.get("restart_time", 0)
            c_str = str(p.get("cpu", "0%")).replace("%", "").strip()
            try:
                cpu_sum += float(c_str)
            except Exception:
                pass
            if "webreport" in name:
                web_r = r
            elif "pulsa" in name:
                pulsa_r = r

        tot_restarts = web_r + pulsa_r
        ram_used = v_sys.get("ram_used_mb", 0)
        ram_tot = v_sys.get("ram_total_mb", 0)
        ram_pct = v_sys.get("ram_pct", 0)
        uptime_vps = v_sys.get("uptime", "").split("load average")[0].strip()
        uptime_clean = "-"
        if "up" in uptime_vps:
            parts = uptime_vps.split("up")[1].split(",")
            uptime_clean = parts[0].strip()
            if len(parts) > 1 and "user" not in parts[1]:
                uptime_clean += ", " + parts[1].strip()

        # Refresh di background jika sudah lebih dari 20 detik
        if time.time() - _LAST_VPS_FETCH_TIME > 20:
            threading.Thread(target=_fetch_vps_telemetry_background, daemon=True).start()

        return {
            "ok": True,
            "host": "VPS depas.my.id",
            "ram": {
                "used_mb": ram_used,
                "total_mb": ram_tot,
                "pct": ram_pct,
                "display": f"{ram_used} MB ({round(ram_pct)}%)" if ram_tot < 2000 else f"{round(ram_used/1024, 1)}G / {round(ram_tot/1024, 1)}G ({round(ram_pct)}%)",
                "status": "critical" if ram_pct >= 90 else ("warning" if ram_pct >= 75 else "normal")
            },
            "cpu": {
                "pct": round(cpu_sum, 1),
                "display": f"{round(cpu_sum, 1)}%",
                "status": "critical" if cpu_sum >= 80 else ("warning" if cpu_sum >= 50 else "normal")
            },
            "restart": {
                "count": tot_restarts,
                "webreport": web_r,
                "depotpulsa": pulsa_r,
                "uptime": uptime_clean,
                "display": f"{tot_restarts}x",
                "status": "warning" if tot_restarts > 0 else "normal"
            }
        }

    # Belum ada cache VPS: trigger fetch di background dan fallback ke lokal Windows
    threading.Thread(target=_fetch_vps_telemetry_background, daemon=True).start()

    used_gb, tot_gb, pct = 0, 0, 0
    try:
        import ctypes
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ('dwLength', ctypes.c_ulong),
                ('dwMemoryLoad', ctypes.c_ulong),
                ('ullTotalPhys', ctypes.c_ulonglong),
                ('ullAvailPhys', ctypes.c_ulonglong),
                ('ullTotalPageFile', ctypes.c_ulonglong),
                ('ullAvailPageFile', ctypes.c_ulonglong),
                ('ullTotalVirtual', ctypes.c_ulonglong),
                ('ullAvailVirtual', ctypes.c_ulonglong),
                ('ullAvailExtendedVirtual', ctypes.c_ulonglong),
            ]
        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
        tot_gb = round(stat.ullTotalPhys / (1024**3), 1)
        avail_gb = round(stat.ullAvailPhys / (1024**3), 1)
        used_gb = round(tot_gb - avail_gb, 1)
        pct = stat.dwMemoryLoad
    except Exception:
        pass

    uptime_sec = int(time.time() - _START_TIME)
    h = uptime_sec // 3600
    m = (uptime_sec % 3600) // 60
    uptime_str = f"{h}h {m}m"

    return {
        "ok": True,
        "host": "Local Workstation",
        "ram": {
            "used_mb": int(used_gb * 1024),
            "total_mb": int(tot_gb * 1024),
            "pct": pct,
            "display": f"{used_gb}G / {tot_gb}G ({pct}%)",
            "status": "critical" if pct >= 90 else ("warning" if pct >= 80 else "normal")
        },
        "cpu": {
            "pct": 5.0,
            "display": "5%",
            "status": "normal"
        },
        "restart": {
            "count": 0,
            "webreport": 0,
            "depotpulsa": 0,
            "uptime": uptime_str,
            "display": "0x",
            "status": "normal"
        }
    }

def log(message: str, state: str = None, action: str = None, detail: str = None):
    """Mencatat aktivitas baru ke telemetry stream."""
    global _CURRENT_STATUS
    ts = datetime.now().strftime("%H:%M:%S")
    entry = {
        "timestamp": ts,
        "message": str(message).strip(),
        "state": state or "info"
    }
    with _LOCK:
        _LOG_BUFFER.append(entry)
        if action:
            _CURRENT_STATUS["action"] = action
        if state and state in ("idle", "busy", "success", "warning", "error"):
            _CURRENT_STATUS["state"] = state
        if detail is not None:
            _CURRENT_STATUS["detail"] = detail
        _CURRENT_STATUS["last_updated"] = ts


def set_busy(action: str, detail: str = "", progress: int = None):
    """Set status server menjadi sibuk (Busy / Processing)."""
    global _CURRENT_STATUS
    ts = datetime.now().strftime("%H:%M:%S")
    with _LOCK:
        _CURRENT_STATUS["state"] = "busy"
        _CURRENT_STATUS["action"] = action
        _CURRENT_STATUS["detail"] = detail
        _CURRENT_STATUS["progress"] = progress
        _CURRENT_STATUS["last_updated"] = ts
        _LOG_BUFFER.append({
            "timestamp": ts,
            "message": f"[PROCESS] {action} {('(' + detail + ')') if detail else ''}".strip(),
            "state": "busy"
        })


def set_idle(action: str = "Server Ready - Parquet & SQLite Sinkron", detail: str = "RAM Cache Aktif"):
    """Set status server menjadi siap (Idle / Ready)."""
    global _CURRENT_STATUS
    ts = datetime.now().strftime("%H:%M:%S")
    with _LOCK:
        _CURRENT_STATUS["state"] = "idle"
        _CURRENT_STATUS["action"] = action
        _CURRENT_STATUS["detail"] = detail
        _CURRENT_STATUS["progress"] = None
        _CURRENT_STATUS["last_updated"] = ts
        _LOG_BUFFER.append({
            "timestamp": ts,
            "message": f"[READY] {action}".strip(),
            "state": "idle"
        })


def get_telemetry():
    """Mengembalikan snapshot live status dan riwayat log untuk API."""
    uptime_sec = int(time.time() - _START_TIME)
    uptime_str = f"{uptime_sec // 3600}h {(uptime_sec % 3600) // 60}m {uptime_sec % 60}s"
    with _LOCK:
        return {
            "ok": True,
            "state": _CURRENT_STATUS["state"],
            "action": _CURRENT_STATUS["action"],
            "detail": _CURRENT_STATUS["detail"],
            "progress": _CURRENT_STATUS["progress"],
            "last_updated": _CURRENT_STATUS["last_updated"],
            "uptime": uptime_str,
            "logs": list(_LOG_BUFFER)[-30:]  # 30 log terakhir
        }


# Inisialisasi awal saat modul di-load
log("Web Report Telemetry Engine diinisialisasi.", state="idle", action="Server Ready - Parquet & SQLite Sinkron", detail="RAM Cache Aktif")
