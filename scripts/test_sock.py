import paramiko

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

# Test script inside wa_gateway on VPS
cmd = """python3 -c "
import urllib.request, json
# Let's test single check-phone first
req = urllib.request.Request('http://127.0.0.1:3000/check-phone', data=json.dumps({'phone':'081389779977'}).encode(), headers={'Content-Type':'application/json'})
with urllib.request.urlopen(req) as r:
    print('Single check response:', r.read().decode())
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
