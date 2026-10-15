import os
import subprocess
import sys

def create_desktop_shortcut():
    pythonw_path = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    desktop_app_path = os.path.abspath("desktop_app.py")
    icon_path = os.path.abspath("static/img/app_icon.ico")
    working_dir = os.path.abspath(".")

    ps_script = f"""
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Web Report Depo Cell.lnk'
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = '{pythonw_path}'
$Shortcut.Arguments = '"{desktop_app_path}"'
$Shortcut.WorkingDirectory = '{working_dir}'
$Shortcut.IconLocation = '{icon_path},0'
$Shortcut.Description = 'Web Report - Depo Cell Desktop App'
$Shortcut.Save()
Write-Host "Shortcut updated at: $shortcutPath"
"""
    res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, text=True, check=True)
    print(res.stdout.strip())

if __name__ == "__main__":
    create_desktop_shortcut()
