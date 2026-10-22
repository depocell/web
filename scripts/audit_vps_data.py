import sys
import paramiko
import json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('45.66.153.150', port=20277, username='root', password='P@sha057614', timeout=30)

inspect_code = """
import json, os

files = [
    'pages/home/overview_data.json',
    'pages/analisa/supplier_modules.json',
    'pages/analisa/data.json',
    'pages/sco/data_sco.json',
    'pages/sco/data_reseller.json',
    '.cache/analisa_gold_history.json'
]

out = {}
for fp in files:
    full_path = os.path.join('/var/www/webreport', fp)
    if os.path.exists(full_path):
        size = os.path.getsize(full_path)
        with open(full_path, 'r', encoding='utf-8') as f:
            d = json.load(f)
        
        info = {
            'size_kb': round(size / 1024, 1),
            'type': type(d).__name__
        }
        if isinstance(d, dict):
            info['keys'] = list(d.keys())[:15]
            if 'ASTAGA' in d:
                info['subkeys_astaga'] = list(d['ASTAGA'].keys())[:12]
            if 'periods' in d:
                info['periods_count'] = len(d['periods'])
                info['periods_keys'] = list(d['periods'].keys())
        elif isinstance(d, list):
            info['count'] = len(d)
            if d:
                info['sample_keys'] = list(d[0].keys())
        out[fp] = info

print(json.dumps(out, indent=2))
"""

cmd = f"/var/www/webreport/venv/bin/python -c {json.dumps(inspect_code)}"
stdin, stdout, stderr = ssh.exec_command(cmd)
res_text = stdout.read().decode('utf-8', errors='replace')
err_text = stderr.read().decode('utf-8', errors='replace')
print("RESULT:\n", res_text)
if err_text.strip():
    print("ERROR:\n", err_text)
ssh.close()
