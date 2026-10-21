import paramiko

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

test_script = """node -e "
const http = require('http');
// Check endpoint with array
console.log('Testing...');
" """
stdin, stdout, stderr = ssh.exec_command(test_script)
print(stdout.read().decode())
ssh.close()
