import os
import sys
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
print("[Tunnel] Menghubungkan laptop ke Cloudflare Edge Network...")

try:
    subprocess.run(cmd)
except KeyboardInterrupt:
    print("\n[Tunnel] Dihentikan oleh pengguna.")
