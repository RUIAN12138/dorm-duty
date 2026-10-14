"""Install a code-only release and restore the previous symlink on failure."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import tarfile
import time
import urllib.request

archive, name = sys.argv[1:]
if not re.fullmatch(r'[a-zA-Z0-9_-]+', name):
    raise SystemExit('Invalid release name')
directory = Path('/opt/dorm-duty/releases') / name
if directory.exists():
    raise SystemExit('Release already exists; inspect before retrying')
with tarfile.open(archive) as package:
    for item in package.getmembers():
        parts = Path(item.name).parts
        if not parts or parts[0] not in ('scripts', 'site') or '..' in parts or Path(item.name).is_absolute() or not (item.isdir() or item.isfile()):
            raise SystemExit('Release contains an unexpected archive entry')
    directory.mkdir(mode=0o755)
    package.extractall(directory, filter='data')
for filename in ['scripts/local-server.mjs', 'site/worker/index.js']:
    subprocess.run(['/usr/bin/node', '--check', str(directory / filename)], check=True)
current = Path('/opt/dorm-duty/current')
previous = current.resolve(strict=True)
temporary = Path('/opt/dorm-duty/.next-' + name)
temporary.symlink_to(directory)
temporary.replace(current)
try:
    subprocess.run(['systemctl', 'restart', 'dorm-duty'], check=True)
    for attempt in range(40):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8086/dorm-duty/health', timeout=2) as response:
                health = json.load(response)
            if health.get('status') == 'ok' and health.get('runtime') == 'node-server':
                break
        except Exception:
            time.sleep(0.25)
    else:
        raise RuntimeError('Release health check failed')
except Exception:
    temporary.symlink_to(previous)
    temporary.replace(current)
    subprocess.run(['systemctl', 'restart', 'dorm-duty'], check=True)
    raise
print(json.dumps({'status': 'deployed', 'release': str(directory), 'previous': str(previous), 'bundleSha256': hashlib.sha256((directory / 'site/worker/index.js').read_bytes()).hexdigest(), 'health': health}))
