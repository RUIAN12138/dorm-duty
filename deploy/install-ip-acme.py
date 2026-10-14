"""Add the independent IP vhost, retaining the existing domain configuration."""
from pathlib import Path
import datetime
import re
import shutil
import subprocess

config = Path('/usr/local/nginx/conf/nginx.conf')
original = config.read_text()
include = '    include /opt/dorm-duty/nginx-ip.conf;'
if include.strip() in original:
    raise SystemExit('IP include already exists; inspect before changing it again')
changed, count = re.subn(
    r'(server_name\s+guet-csd\.xin\s+www\.guet-csd\.xin)\s+8\.148\.190\.114\s*;',
    r'\1;', original,
)
if count != 2:
    raise SystemExit('Expected exactly two known IP aliases; no changes made')
changed, count = re.subn(r'(\bhttp\s*\{)', r'\1\n' + include, changed, count=1)
if count != 1:
    raise SystemExit('Expected one http block; no changes made')
backup = Path('/opt/dorm-duty/nginx-before-ip-' + datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ') + '.conf')
shutil.copy2(config, backup)
backup.chmod(0o600)
config.write_text(changed)
try:
    subprocess.run(['/usr/bin/nginx', '-t'], check=True)
    subprocess.run(['/usr/bin/nginx', '-s', 'reload'], check=True)
except Exception:
    shutil.copy2(backup, config)
    subprocess.run(['/usr/bin/nginx', '-t'], check=True)
    subprocess.run(['/usr/bin/nginx', '-s', 'reload'], check=True)
    raise
print('Installed isolated IP HTTP entry; original saved at', backup)
