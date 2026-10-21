import paramiko
HOST = "45.66.153.150"
PORT = 20277
USER = "root"
PASS = "P@sha057614"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
cmd = """python3 -c "
import sqlite3
conn = sqlite3.connect('/var/www/webreport/MASTER/master_data.db')
conn.execute('DELETE FROM survey_churn_logs WHERE id = 5')
conn.commit()
conn.close()
print('Log #5 deleted successfully from VPS DB')
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
ssh.close()
