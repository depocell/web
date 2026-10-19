"""
engines/sync_vps_engine.py — Sinkronisasi Database & Parquet ke VPS depas.my.id
---------------------------------------------------------------------------------
Mengunggah file database SQLite (MASTER/) dan cache Parquet/JSON (.cache/) 
dari lokal laptop ke VPS Helipod via SFTP, kemudian merestart service webreport.
"""

import os
import sys
import paramiko
from datetime import datetime

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def sync_to_vps():
    """Melakukan sinkronisasi file data ke VPS dan merestart service."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_messages = []

    def log(msg):
        print(f"[SYNC VPS] {msg}")
        log_messages.append(msg)

    log(f"Memulai sinkronisasi ke VPS {HOST}...")

    try:
        transport = paramiko.Transport((HOST, PORT))
        transport.connect(username=USER, password=PASS)
        sftp = paramiko.SFTPClient.from_transport(transport)
        log("Koneksi SFTP berhasil.")

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
                    # Cek ukuran/timestamp jika perlu, atau unggah langsung db
                    if f.endswith(".db") or f.endswith(".xlsx") or f == "auth_users.json":
                        log(f"Mengunggah MASTER/{f} ...")
                        sftp.put(local_path, rem_path)

        # 3. Sinkronisasi .cache/ & .cache/parts/ (HANYA Parquet data murni)
        local_cache = os.path.join(BASE_DIR, ".cache")
        if os.path.exists(local_cache):
            for root, dirs, files in os.walk(local_cache):
                rel_dir = os.path.relpath(root, local_cache)
                rem_base = "/var/www/webreport/.cache" if rel_dir == "." else f"/var/www/webreport/.cache/{rel_dir.replace(os.sep, '/')}"
                for f in files:
                    if f.endswith(".parquet"):
                        local_path = os.path.join(root, f)
                        rem_path = f"{rem_base}/{f}"
                        should_upload = True
                        try:
                            rem_stat = sftp.stat(rem_path)
                            loc_stat = os.stat(local_path)
                            if rem_stat.st_size == loc_stat.st_size and abs(rem_stat.st_mtime - loc_stat.st_mtime) < 2:
                                should_upload = False
                        except IOError:
                            should_upload = True

                        if should_upload:
                            size_mb = os.path.getsize(local_path) / (1024 * 1024)
                            disp = f".cache/{f}" if rel_dir == "." else f".cache/{rel_dir}/{f}"
                            log(f"Mengunggah {disp} ({size_mb:.2f} MB)...")
                            sftp.put(local_path, rem_path)

        sftp.close()
        transport.close()
        log("Pengunggahan data selesai.")

        # 4. Pull git terbaru & Restart service di VPS
        log("Menarik update kode terbaru dari GitHub di VPS...")
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
        
        # Git pull origin main
        stdin, stdout, stderr = ssh.exec_command("git -C /var/www/webreport pull origin main")
        git_out = stdout.read().decode().strip()
        log(f"Git pull: {git_out}")

        log("Merestart service webreport di VPS...")
        stdin, stdout, stderr = ssh.exec_command("systemctl restart webreport")
        exit_code = stdout.channel.recv_exit_status()
        ssh.close()

        if exit_code == 0:
            log("Service webreport berhasil direstart di VPS.")
            return {
                "ok": True,
                "message": f"Data berhasil disinkronkan ke depas.my.id! ({now_str})",
                "timestamp": now_str,
                "logs": log_messages
            }
        else:
            return {
                "ok": False,
                "error": f"Gagal merestart service webreport (exit code {exit_code})",
                "timestamp": now_str,
                "logs": log_messages
            }

    except Exception as e:
        log(f"Error sinkronisasi VPS: {e}")
        return {
            "ok": False,
            "error": str(e),
            "timestamp": now_str,
            "logs": log_messages
        }

if __name__ == "__main__":
    res = sync_to_vps()
    print("\nResult:", res)
