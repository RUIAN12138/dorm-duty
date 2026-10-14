"""Take an online SQLite backup, including committed WAL data."""
from pathlib import Path
import datetime
import os
import json
import sqlite3

os.umask(0o077)
source = Path('/var/lib/dorm-duty/dorm.sqlite')
directory = Path('/opt/dorm-duty/backups')
directory.mkdir(mode=0o700, parents=True, exist_ok=True)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
destination = directory / ('dorm-' + stamp + '.sqlite')
if destination.exists():
    raise SystemExit('Refusing to overwrite an existing backup')
staged = destination.with_suffix('.sqlite.incomplete')
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
    with sqlite3.connect(str(staged)) as dst:
        src.backup(dst)
        if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Backup integrity check failed')
        if dst.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('Backup foreign key check failed')
# VAPID keys must survive a database restore, or existing device subscriptions
# would no longer match the sender. Keep this app-owned copy private.
key_source = source.with_name('webpush-vapid.json')
if key_source.exists():
    key_bytes = key_source.read_bytes()
    config = json.loads(key_bytes)
    if not all(config.get(field) for field in ('publicKey', 'privateKey', 'subject')):
        raise RuntimeError('Notification key backup validation failed')
    with destination.with_suffix('.vapid.json').open('xb') as output:
        output.write(key_bytes)
    destination.with_suffix('.vapid.json').chmod(0o600)
native_source = source.with_name('native-push.json')
if native_source.exists():
    native_bytes = native_source.read_bytes()
    if not isinstance(json.loads(native_bytes), dict):
        raise RuntimeError('Native notification backup validation failed')
    with destination.with_suffix('.native-push.json').open('xb') as output:
        output.write(native_bytes)
    destination.with_suffix('.native-push.json').chmod(0o600)
os.link(staged, destination)
staged.unlink()
print('Verified database backup:', destination.name)
