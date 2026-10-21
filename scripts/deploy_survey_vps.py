import os
import sys
import paramiko

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
    
    cmd = """
    echo "=== GIT STATUS ==="
    git -C /var/www/webreport status -s
    echo "=== WA GATEWAY DIR ==="
    ls -la /var/www/webreport/wa_gateway
    echo "=== MASTER DB ==="
    ls -lh /var/www/webreport/MASTER/master_data.db
    """
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode())
    ssh.close()

if __name__ == "__main__":
    main()
