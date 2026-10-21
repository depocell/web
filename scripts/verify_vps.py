import sys
import paramiko
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

def verify():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=30)
    
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
    print("Writing wa-gateway.service and restarting services...")
    stdin, stdout, stderr = ssh.exec_command(cmd_service)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out.strip():
        print("STDOUT:", out.strip())
    if err.strip():
        print("STDERR:", err.strip())

    print("Waiting 5s for WhatsApp socket and Web Report to initialize...")
    time.sleep(5)

    verify_cmd = """
    echo "=== SYSTEMD SERVICES ==="
    systemctl is-active wa-gateway
    systemctl is-active webreport

    echo "=== WA GATEWAY STATUS (PORT 3000) ==="
    curl -s http://127.0.0.1:3000/status
    echo ""

    echo "=== WEB REPORT API GATEWAY STATUS ==="
    curl -s http://127.0.0.1:8000/api/survey/gateway-status
    echo ""

    echo "=== CANDIDATES COUNT ==="
    curl -s "http://127.0.0.1:8000/api/survey/candidates?brand=ASTAGA&year=2026&month=2026-10" | grep -o '"ok":true' || echo "FAIL"
    """
    stdin, stdout, stderr = ssh.exec_command(verify_cmd)
    print("\n" + stdout.read().decode('utf-8', errors='replace'))
    ssh.close()

if __name__ == "__main__":
    verify()
