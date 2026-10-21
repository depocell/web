import paramiko

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

cmd = """
echo "=== WEBREPORT SERVICE ==="
cat /etc/systemd/system/webreport.service 2>/dev/null || cat /lib/systemd/system/webreport.service 2>/dev/null
echo "=== NGINX SITES ==="
cat /etc/nginx/sites-enabled/* 2>/dev/null
"""
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
ssh.close()
