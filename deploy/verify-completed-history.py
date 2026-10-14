"""Compare completed rows by private hashes across a release; allow new rows."""
from pathlib import Path
import hashlib
import json
import sqlite3
import sys
snapshot = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('/opt/dorm-duty/backups/pre-rounds-v4-history.json')
with sqlite3.connect('file:/var/lib/dorm-duty/dorm.sqlite?mode=ro', uri=True) as connection:
    connection.row_factory = sqlite3.Row
    current = {str(row['id']): hashlib.sha256(json.dumps(dict(row), sort_keys=True, ensure_ascii=False).encode()).hexdigest()
               for row in connection.execute("SELECT * FROM chore_tasks WHERE status='completed'")}
if sys.argv[1] == 'before':
    with snapshot.open('x') as output:
        json.dump(current, output, sort_keys=True)
    snapshot.chmod(0o600)
    print(json.dumps({'phase':'before','completedRecords':len(current)}))
else:
    previous = json.loads(snapshot.read_text())
    if not all(current.get(row_id) == digest for row_id, digest in previous.items()):
        raise SystemExit('Completed history changed: inspect before continuing')
    print(json.dumps({'phase':'after','previousRecordsVerified':len(previous),'currentRecords':len(current),'historyPreserved':True}))
