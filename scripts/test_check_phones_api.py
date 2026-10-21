import paramiko

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
cmd = """python3 -c "
import urllib.request, json
payload = json.dumps({'phones': ['081389779977', '085882888808', '089999999999999']}).encode()
req = urllib.request.Request('http://127.0.0.1:8000/api/survey/check-phones', data=payload, headers={'Content-Type':'application/json'}, method='POST')
with urllib.request.urlopen(req) as r:
    print('Check phones result:', r.read().decode())
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
ssh.close()
