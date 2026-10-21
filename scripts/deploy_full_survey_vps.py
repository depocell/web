import os
import sys
import paramiko
import time

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def deploy():
    print(f"=== [1/6] Connecting SSH/SFTP to VPS {HOST}:{PORT} ===")
    transport = paramiko.Transport((HOST, PORT))
    transport.connect(username=USER, password=PASS)
    sftp = paramiko.SFTPClient.from_transport(transport)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=30)
    print("SSH & SFTP connected successfully.")

    # 1. Git pull origin main
    print("\n=== [2/6] Pulling latest code on VPS ===")
    stdin, stdout, stderr = ssh.exec_command("git -C /var/www/webreport pull origin main")
    print(stdout.read().decode())
    print(stderr.read().decode())

    # 2. Upload master_data.db
    local_db = os.path.join(BASE_DIR, "MASTER", "master_data.db")
    remote_db = "/var/www/webreport/MASTER/master_data.db"
    size_mb = os.path.getsize(local_db) / (1024 * 1024)
    print(f"\n=== [3/6] Uploading {local_db} ({size_mb:.2f} MB) to VPS ===")
    sftp.put(local_db, remote_db)
    print("master_data.db uploaded successfully.")

    # 3. Upload wa_gateway/session directory
    print("\n=== [4/6] Uploading WhatsApp session to VPS ===")
    local_session = os.path.join(BASE_DIR, "wa_gateway", "session")
    remote_session = "/var/www/webreport/wa_gateway/session"
    
    # Ensure remote directory exists
    try:
        sftp.stat(remote_session)
    except IOError:
        try:
            sftp.mkdir(remote_session)
        except Exception as e:
            print(f"mkdir error: {e}")

    session_files = [f for f in os.listdir(local_session) if os.path.isfile(os.path.join(local_session, f))]
    print(f"Uploading {len(session_files)} session files...")
    for sf in session_files:
        src = os.path.join(local_session, sf)
        dst = f"{remote_session}/{sf}"
        sftp.put(src, dst)
    print("All WhatsApp session files uploaded.")

    sftp.close()
    transport.close()

    # 4. Install npm dependencies on VPS
    print("\n=== [5/6] Installing npm packages in /var/www/webreport/wa_gateway ===")
    cmd_npm = "cd /var/www/webreport/wa_gateway && npm install --omit=dev"
    stdin, stdout, stderr = ssh.exec_command(cmd_npm)
    print(stdout.read().decode())
    print(stderr.read().decode())

    # 5. Setup systemd service & restart
    print("\n=== [6/6] Configuring wa-gateway.service and restarting services ===")
    service_content = """[Unit]
Description=WhatsApp Gateway for Web Report Survey
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/webreport/wa_gateway
ExecStart=/usr/bin/node gateway.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=WEB_REPORT_URL=http://127.0.0.1:8000

[Install]
WantedBy=multi-user.target
"""
    cmd_service = f"""
cat << 'EOF' > /etc/systemd/system/wa-gateway.service
{service_content}
EOF
systemctl daemon-reload
systemctl enable wa-gateway
systemctl restart wa-gateway
systemctl restart webreport
"""
    stdin, stdout, stderr = ssh.exec_command(cmd_service)
    print(stdout.read().decode())
    print(stderr.read().decode())

    print("Waiting 5 seconds for services to warm up...")
    time.sleep(5)

    # 6. Verification
    print("\n=== [VERIFICATION] Checking Service & Gateway Status ===")
    verify_cmd = """
    echo "--- Systemd Service Status ---"
    systemctl is-active wa-gateway
    systemctl is-active webreport
    
    echo "--- Port 3000 listening? ---"
    ss -tulpn | grep 3000 || netstat -tulpn | grep 3000

    echo "--- Gateway /status endpoint ---"
    curl -s http://127.0.0.1:3000/status
    echo ""

    echo "--- Web Report /api/survey/gateway-status endpoint ---"
    curl -s http://127.0.0.1:8000/api/survey/gateway-status
    echo ""

    echo "--- Web Report Candidates sample ---"
    curl -s "http://127.0.0.1:8000/api/survey/candidates?brand=ASTAGA&year=2026&month=2026-10" | head -c 250
    echo ""
    """
    stdin, stdout, stderr = ssh.exec_command(verify_cmd)
    print(stdout.read().decode())
    print(stderr.read().decode())

    ssh.close()
    print("\n[SUCCESS] VPS Deployment Finished!")

if __name__ == "__main__":
    deploy()
