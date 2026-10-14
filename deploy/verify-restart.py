"""Verify retained completion history through an app service restart."""
import hashlib
import json
import sqlite3
import subprocess
import time
import urllib.request

def snapshot():
    db = sqlite3.connect('file:/var/lib/dorm-duty/dorm.sqlite?mode=ro', uri=True)
    try:
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert db.execute('PRAGMA foreign_key_check').fetchall() == []
        history = db.execute(
            'SELECT id,dorm_id,assignee_id,status,completed_at FROM chore_tasks WHERE status="completed" ORDER BY id'
        ).fetchall()
        settings = db.execute('SELECT * FROM chore_categories ORDER BY id').fetchall()
        rooms = db.execute('SELECT COUNT(*) FROM dormitories').fetchone()[0]
        return {
            'completed': len(history), 'rooms': rooms,
            'completionSha256': hashlib.sha256(json.dumps(history).encode()).hexdigest(),
            'settingsSha256': hashlib.sha256(json.dumps(settings).encode()).hexdigest(),
        }
    finally:
        db.close()

def pid():
    return subprocess.check_output(['systemctl','show','dorm-duty','-p','MainPID','--value']).decode().strip()

before = snapshot()
previous_pid = pid()
subprocess.run(['systemctl','restart','dorm-duty'], check=True)
for attempt in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8086/dorm-duty/health', timeout=2) as response:
            health = json.load(response)
        if health.get('status') == 'ok':
            break
    except Exception:
        time.sleep(0.5)
else:
    raise RuntimeError('App health did not recover after restart')
after = snapshot()
assert before == after, 'Completion history or task settings changed after restart'
assert previous_pid != pid(), 'Service process did not restart'
print(json.dumps({'status':'passed','serviceRestart':True,'records':after,'health':health}))
