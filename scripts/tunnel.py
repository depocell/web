import os
import sys
import time
import subprocess

TOKEN = "eyJhIjoiZjdkZTE5NTVjMDRjZGYzNGM0MDk1Njg4Zjg1YWMzOWEiLCJ0IjoiNTlmZDcyZDYtYWIwZi00NzJkLTkzOGYtYjc3OTNlYzcyMDNkIiwicyI6Ik9UWXpPVGt3TjJVdE1tSmpOaTAwTVdKa0xXSmpPRFl0T0RreVlqTmtaakZrWm1ZeSJ9"

BIN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bin")
CF_EXE = os.path.join(BIN_DIR, "cloudflared.exe")

if not os.path.exists(CF_EXE):
    print("cloudflared.exe tidak ditemukan di:", CF_EXE)
    sys.exit(1)

cmd = [CF_EXE, "tunnel", "run", "--token", TOKEN]
print("=" * 65)
print("  MEMULAI CLOUDFLARE PERMANENT TUNNEL (depas.my.id)")
print("=" * 65)
print("[Tunnel] Menghubungkan laptop ke Cloudflare Edge Network (Auto-restart mode)...")

NO_WINDOW = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
PID_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".cache", "tunnel.pid")

while True:
    try:
        proc = subprocess.run(cmd, creationflags=NO_WINDOW)
        # Jika tunnel.pid sudah dihapus oleh stop_tunnel(), keluar permanen
        if not os.path.exists(PID_FILE):
            print("\n[Tunnel] Sinyal stop terdeteksi. Berhenti.")
            break
        print(f"[Tunnel] Process exited with code {proc.returncode}. Reconnecting in 3 seconds...")
        time.sleep(3)
    except KeyboardInterrupt:
        print("\n[Tunnel] Dihentikan oleh pengguna.")
        break
    except Exception as e:
        if not os.path.exists(PID_FILE):
            break
        print(f"[Tunnel] Error: {e}. Reconnecting in 5 seconds...")
        time.sleep(5)

