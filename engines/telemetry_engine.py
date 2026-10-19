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
