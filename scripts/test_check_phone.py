import paramiko
import json

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

# Test 1: Check bot number itself (must exist)
cmd1 = 'curl -s -X POST http://127.0.0.1:3000/check-phone -H "Content-Type: application/json" -d \'{"phone":"6281389779977"}\''
# Test 2: Check fake number (must not exist)
cmd2 = 'curl -s -X POST http://127.0.0.1:3000/check-phone -H "Content-Type: application/json" -d \'{"phone":"62899999999999999"}\''

stdin, stdout, stderr = ssh.exec_command(f"{cmd1}; echo ''; {cmd2}")
print(stdout.read().decode())
ssh.close()
