"""Prepare a code-only release after the frontend build has completed."""
from pathlib import Path
import shutil
import subprocess
import sys
root = Path(__file__).resolve().parent.parent
name = sys.argv[1]
frontend_dist = Path(sys.argv[2] if len(sys.argv) > 2 else '../frontend/dist-server')
if not frontend_dist.is_absolute():
    frontend_dist = root / frontend_dist
if not name.replace('-', '').replace('_', '').isalnum():
    raise SystemExit('Invalid release name')
stage = root / 'data' / name
if stage.exists():
    raise SystemExit('Release staging directory already exists')
stage.mkdir(parents=True)
subprocess.run(['node', 'scripts/embed-frontend.mjs'], cwd=root / 'site', env={**__import__('os').environ, 'DORM_FRONTEND_DIST': str(frontend_dist.resolve()), 'DORM_WORKER_OUTPUT': str(stage / 'site/worker/index.js')}, check=True)
files = ['scripts/local-server.mjs','scripts/native-push-provider.mjs','site/worker/backend.mjs','site/worker/chores.mjs','site/shared/member-marks.mjs','site/shared/push-endpoint.mjs','site/local/database.mjs','site/local/sqlite-d1.mjs','site/runtime/push-runtime.cjs','site/runtime/WEB_PUSH_LICENSE', 'site/scripts/check-native-push.mjs', 'site/scripts/check-cloud-backend.mjs', 'site/scripts/check-history.mjs', 'site/scripts/check-recency.mjs']
files += ['site/shared/notifications.mjs']
files += ['site/shared/ical.mjs', 'site/worker/calendar.mjs']
files += ['site/runtime/email-runtime.cjs', 'site/runtime/NODEMAILER_LICENSE']
files += [str(p.relative_to(root)) for p in (root/'site/drizzle').glob('*.sql')]
for filename in files:
    target = stage / filename
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(root / filename, target)
(stage / 'site/package.json').write_text('{"type":"module","private":true}')
for path in stage.rglob('*'):
    path.chmod(0o755 if path.is_dir() else 0o644)
archive = root / 'data' / (name + '.tar.gz')
subprocess.run(['tar','-czf',str(archive),'-C',str(stage),'scripts','site'],check=True)
print(archive)
