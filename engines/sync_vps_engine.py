"""
engines/sync_vps_engine.py — Sinkronisasi Database & Parquet ke VPS depas.my.id
---------------------------------------------------------------------------------
Mengunggah file database SQLite (MASTER/) dan cache Parquet/JSON (.cache/) 
dari lokal laptop ke VPS via SFTP, merestart PM2 webreport, dan mengecek telemetri VPS.
Mendukung live streaming log generator untuk Web UI Terminal.
"""

import os
import sys
import json
import time
import urllib.request
import paramiko
from datetime import datetime

HOST = os.environ.get("VPS_HOST", "185.205.222.170")
PORT = int(os.environ.get("VPS_PORT", 22))
USER = os.environ.get("VPS_USER", "root")
PASS = os.environ.get("VPS_PASS", "P@sha057614")
DOMAIN = "depas.my.id"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_ssh_client():
    """Membuat koneksi SSH Paramiko dengan autentikasi Key atau Password."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key_path = os.path.expanduser("~/.ssh/id_ed25519")
    if os.path.exists(key_path):
        try:
            pkey = paramiko.Ed25519Key.from_private_key_file(key_path)
            client.connect(HOST, port=PORT, username=USER, pkey=pkey, timeout=8)
            return client
        except Exception:
            try:
                client.close()
            except Exception:
                pass
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=8)
    return client


def get_sftp_client():
    """Membuat koneksi SFTP Paramiko secara stabil melalui SSH Client."""
    ssh = get_ssh_client()
    sftp = ssh.open_sftp()
    return ssh, sftp


def get_sftp_transport():
    """Membuat koneksi SFTP transport Paramiko (kompatibilitas legacy)."""
    ssh = get_ssh_client()
    return ssh.get_transport()


def get_vps_status():
    """Mengambil status telemetri lengkap dari VPS: HTTP health, PM2 cluster, RAM & CPU, dan file data."""
    res = {
        "ok": False,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "vps_ip": HOST,
        "domain": DOMAIN,
        "http": {
            "online": False,
            "code": 0,
            "latency_ms": 0,
            "role": "unknown"
        },
        "system": {
            "uptime": "-",
            "load_avg": "-",
            "ram_total_mb": 0,
            "ram_used_mb": 0,
            "ram_pct": 0,
            "swap_total_mb": 0,
            "swap_used_mb": 0,
            "swap_pct": 0
        },
        "pm2": [],
        "cache_files": []
    }

    # 1. HTTP Health Check via Cloudflare
    t0 = time.time()
    try:
        req = urllib.request.Request(f"https://{DOMAIN}/api/auth/status", headers={"User-Agent": "WebReportMonitor/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            code = resp.getcode()
            body = json.loads(resp.read().decode("utf-8"))
            res["http"] = {
                "online": code == 200,
                "code": code,
                "latency_ms": round((time.time() - t0) * 1000),
                "role": body.get("role", "unknown")
            }
    except Exception as e_http:
        res["http"]["error"] = str(e_http)

    # 2. SSH Telemetry Check
    try:
        ssh = get_ssh_client()
        cmd = 'free -m; echo "___SPLIT___"; uptime; echo "___SPLIT___"; pm2 jlist; echo "___SPLIT___"; ls -lh --time-style=+"%Y-%m-%d %H:%M" /var/www/webreport/.cache'
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=8)
        raw_out = stdout.read().decode("utf-8", errors="ignore")
        ssh.close()

        parts = raw_out.split("___SPLIT___")
        if len(parts) >= 4:
            # Parse free -m
            free_lines = [l.strip() for l in parts[0].strip().split("\n") if l.strip()]
            for l in free_lines:
                if l.startswith("Mem:"):
                    vals = l.split()
                    if len(vals) >= 3:
                        tot = int(vals[1])
                        used = int(vals[2])
                        res["system"]["ram_total_mb"] = tot
                        res["system"]["ram_used_mb"] = used
                        res["system"]["ram_pct"] = round(used / tot * 100, 1) if tot > 0 else 0
                elif l.startswith("Swap:"):
                    vals = l.split()
                    if len(vals) >= 3:
                        tot = int(vals[1])
                        used = int(vals[2])
                        res["system"]["swap_total_mb"] = tot
                        res["system"]["swap_used_mb"] = used
                        res["system"]["swap_pct"] = round(used / tot * 100, 1) if tot > 0 else 0

            # Parse uptime
            res["system"]["uptime"] = parts[1].strip()

            # Parse PM2
            try:
                pm2_json = json.loads(parts[2].strip())
                pm2_list = []
                for p in pm2_json:
                    monit = p.get("monit", {})
                    env = p.get("pm2_env", {})
                    mem_bytes = monit.get("memory", 0)
                    mem_mb = round(mem_bytes / (1024 * 1024), 1)
                    pm2_list.append({
                        "name": p.get("name", "unknown"),
                        "pid": p.get("pid", 0),
                        "status": env.get("status", "unknown"),
                        "cpu": f"{monit.get('cpu', 0)}%",
                        "memory": f"{mem_mb} MB",
                        "restart_time": env.get("restart_time", 0)
                    })
                res["pm2"] = pm2_list
            except Exception:
                pass

            # Parse cache files
            ls_lines = [l.strip() for l in parts[3].strip().split("\n") if l.strip()]
            files_list = []
            for l in ls_lines:
                tokens = l.split()
                if len(tokens) >= 8 and (tokens[-1].endswith(".parquet") or tokens[-1].endswith(".json")):
                    files_list.append({
                        "name": tokens[-1],
                        "size": tokens[4],
                        "mtime": f"{tokens[5]} {tokens[6]}"
                    })
            # Prioritaskan file 2026
            files_list.sort(key=lambda x: ("2026" not in x["name"], x["name"]))
            res["cache_files"] = files_list

        res["ok"] = True
    except Exception as e_ssh:
        res["ssh_error"] = str(e_ssh)

    return res


def sync_to_vps_stream():
    """Generator yang menghasilkan log secara streaming real-time untuk ditampilkan di Web Terminal."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    yield {
        "type": "start",
        "message": f"Memulai sinkronisasi ke VPS {HOST} (depas.my.id)...",
        "timestamp": now_str
    }

    try:
        yield {"type": "log", "level": "info", "message": f"Menghubungkan SFTP ke {HOST}:{PORT} sebagai user '{USER}'..."}
        ssh_sftp, sftp = get_sftp_client()
        yield {"type": "log", "level": "success", "message": "Koneksi SFTP berhasil terjalin."}

        # 1. Pastikan remote direktori ada
        for rem_dir in ["/var/www/webreport/MASTER", "/var/www/webreport/.cache", "/var/www/webreport/.cache/parts"]:
            try:
                sftp.stat(rem_dir)
            except IOError:
                sftp.mkdir(rem_dir)

        # 2. Sinkronisasi MASTER/
        local_master = os.path.join(BASE_DIR, "MASTER")
        if os.path.exists(local_master):
            for f in os.listdir(local_master):
                local_path = os.path.join(local_master, f)
                if os.path.isfile(local_path):
                    rem_path = f"/var/www/webreport/MASTER/{f}"
                    if f.endswith(".db") or f.endswith(".xlsx") or f == "auth_users.json":
                        size_mb = os.path.getsize(local_path) / (1024 * 1024)
                        yield {"type": "log", "level": "upload", "message": f"Mengunggah MASTER/{f} ({size_mb:.2f} MB)..."}
                        sftp.put(local_path, rem_path)

        # 3. Kumpulkan file yang perlu diunggah dari .cache
        local_cache = os.path.join(BASE_DIR, ".cache")
        files_to_upload = []
        if os.path.exists(local_cache):
            for root, dirs, files in os.walk(local_cache):
                rel_dir = os.path.relpath(root, local_cache)
                rem_base = "/var/www/webreport/.cache" if rel_dir == "." else f"/var/www/webreport/.cache/{rel_dir.replace(os.sep, '/')}"
                for f in files:
                    # Filter file parquet & json penting
                    if f.endswith(".parquet") or (f.endswith(".json") and ("analisa_gold" in f or "yoy" in f)):
                        local_path = os.path.join(root, f)
                        rem_path = f"{rem_base}/{f}"
                        files_to_upload.append((local_path, rem_path, rel_dir, f))

        total_files = len(files_to_upload)
        uploaded_count = 0
        yield {"type": "log", "level": "info", "message": f"Memeriksa {total_files} file cache Parquet/JSON lokal vs remote..."}

        for local_path, rem_path, rel_dir, f in files_to_upload:
            should_upload = True
            try:
                rem_stat = sftp.stat(rem_path)
                loc_stat = os.stat(local_path)
                # Jika ukuran persis sama dan timestamp dekat, lewati
                if rem_stat.st_size == loc_stat.st_size and abs(rem_stat.st_mtime - loc_stat.st_mtime) < 2:
                    should_upload = False
            except IOError:
                should_upload = True

            disp = f".cache/{f}" if rel_dir == "." else f".cache/{rel_dir}/{f}"
            size_mb = os.path.getsize(local_path) / (1024 * 1024)

            if should_upload:
                yield {
                    "type": "log",
                    "level": "upload",
                    "message": f"Mengunggah {disp} ({size_mb:.2f} MB)...",
                    "file": f,
                    "size_mb": round(size_mb, 2)
                }
                sftp.put(local_path, rem_path)
                uploaded_count += 1
            else:
                yield {
                    "type": "log",
                    "level": "skip",
                    "message": f"Identik: {disp} ({size_mb:.2f} MB) - Di-skip."
                }

        sftp.close()
        ssh_sftp.close()
        yield {"type": "log", "level": "success", "message": f"Selesai transfer file. ({uploaded_count} file diunggah)."}

        # 4. Pull Git di VPS
        yield {"type": "log", "level": "info", "message": "Menarik update kode terbaru dari GitHub di VPS..."}
        ssh = get_ssh_client()
        stdin, stdout, stderr = ssh.exec_command("git -C /var/www/webreport pull origin main")
        git_out = stdout.read().decode("utf-8").strip()
        yield {"type": "log", "level": "git", "message": f"Git pull output: {git_out}"}

        # 5. Restart PM2 webreport
        yield {"type": "log", "level": "restart", "message": "Merestart service PM2 webreport di VPS..."}
        stdin, stdout, stderr = ssh.exec_command("pm2 restart webreport")
        exit_code = stdout.channel.recv_exit_status()
        pm2_out = stdout.read().decode("utf-8").strip()
        ssh.close()

        if exit_code == 0:
            yield {"type": "log", "level": "success", "message": "Service PM2 webreport berhasil di-restart!"}
        else:
            yield {"type": "log", "level": "warning", "message": f"Restart exit code: {exit_code}. Output: {pm2_out}"}

        # 6. Push SCO jika ada update
        try:
            yield {"type": "log", "level": "sco", "message": "Menyinkronkan data SCO sales ke GitHub Pages (depocell/SCO)..."}
            import engines.sco_engine as sco_engine
            sco_res = sco_engine.push_to_github()
            sco_msg = sco_res.get('message') or sco_res.get('error')
            yield {"type": "log", "level": "sco", "message": f"SCO Push: {sco_msg}"}
        except Exception as e_sco:
            yield {"type": "log", "level": "warning", "message": f"SCO Push Warning: {e_sco}"}

        finish_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        yield {
            "type": "done",
            "ok": True,
            "message": f"Sinkronisasi SUKSES! Data di https://{DOMAIN} sudah LIVE!",
            "timestamp": finish_str
        }

    except Exception as e:
        yield {
            "type": "error",
            "ok": False,
            "message": f"Error sinkronisasi VPS: {str(e)}"
        }


def sync_to_vps():
    """Fungsi wrapper sinkronisasi standar untuk eksekusi CLI / bat file."""
    log_messages = []
    success = False
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for event in sync_to_vps_stream():
        msg = event.get("message") or event.get("error") or ""
        if msg:
            print(f"[SYNC VPS] {msg}")
            log_messages.append(msg)
        if event.get("type") == "done" and event.get("ok"):
            success = True

    return {
        "ok": success,
        "message": f"Data berhasil disinkronkan ke {DOMAIN}! ({now_str})" if success else "Sinkronisasi gagal",
        "timestamp": now_str,
        "logs": log_messages
    }


if __name__ == "__main__":
    res = sync_to_vps()
    print("\nResult:", res)
