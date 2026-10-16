CREATE TABLE chore_history_entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 dorm_id INTEGER NOT NULL REFERENCES dormitories(id),
 task_id INTEGER UNIQUE REFERENCES chore_tasks(id),
 assignee_id INTEGER NOT NULL REFERENCES users(id),
 key TEXT NOT NULL CHECK(key IN ('floor','toilet','sink','water')),
 name TEXT NOT NULL,
 assignee_name_snapshot TEXT NOT NULL,
 marker_id_snapshot TEXT NOT NULL,
 completed_at TEXT NOT NULL,
 voided INTEGER NOT NULL DEFAULT 0 CHECK(voided IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 operation_key TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX chore_history_dorm_time ON chore_history_entries(dorm_id,completed_at);
CREATE TABLE chore_history_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 entry_id INTEGER NOT NULL REFERENCES chore_history_entries(id),
 dorm_id INTEGER NOT NULL REFERENCES dormitories(id),
 actor_id INTEGER NOT NULL REFERENCES users(id),
 actor_name TEXT NOT NULL,
 before_json TEXT,
 after_json TEXT NOT NULL,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX chore_history_audit_entry ON chore_history_audit(dorm_id,entry_id,id);
