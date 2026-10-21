import paramiko

HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
cmd = "grep -n -C 5 'openBatchSurveyModal' /var/www/webreport/pages/survey/survey.js"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
ssh.close()
