import paramiko
import time

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

cmd = """
git -C /var/www/webreport pull origin main
systemctl restart wa-gateway
systemctl restart webreport
sleep 3
systemctl is-active wa-gateway
systemctl is-active webreport
curl -s http://127.0.0.1:3000/status
"""
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
