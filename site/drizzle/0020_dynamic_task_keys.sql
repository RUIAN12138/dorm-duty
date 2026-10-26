-- Extend task IDs for explicitly configured schema-v2 rooms while retaining
-- the existing canonical IDs, row IDs, snapshots and foreign-key graph.
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE __new_chore_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  dorm_id INTEGER NOT NULL REFERENCES dormitories(id),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  deadline_time TEXT NOT NULL,
  start_date TEXT NOT NULL,
  weekdays TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
  rotation_days INTEGER NOT NULL DEFAULT 1,
  rotation_order TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'self_round',
  reminder_interval_days INTEGER NOT NULL DEFAULT 3 CHECK(reminder_interval_days BETWEEN 1 AND 365),
  CONSTRAINT chore_category_mode_check CHECK(mode IN ('scheduled','self_round','completion')),
  CONSTRAINT chore_category_key_check CHECK(
    key IN ('floor','toilet','sink','water') OR
    (length(key)=37 AND substr(key,1,5)='task_' AND substr(key,6) NOT GLOB '*[^0-9a-f]*')
  ),
  CONSTRAINT chore_rotation_days_check CHECK(rotation_days BETWEEN 1 AND 30)
);
--> statement-breakpoint
INSERT INTO __new_chore_categories SELECT * FROM chore_categories;
--> statement-breakpoint
CREATE TABLE __new_chore_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  dorm_id INTEGER NOT NULL REFERENCES dormitories(id),
  key TEXT NOT NULL,
  task_key TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  duty_date TEXT NOT NULL,
  assignee_id INTEGER NOT NULL REFERENCES users(id),
  assignee_name_snapshot TEXT NOT NULL,
  marker_id_snapshot TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TEXT,
  sequence INTEGER,
  completed_by INTEGER REFERENCES users(id),
  CONSTRAINT chore_task_key_check CHECK(
    key IN ('floor','toilet','sink','water') OR
    (length(key)=37 AND substr(key,1,5)='task_' AND substr(key,6) NOT GLOB '*[^0-9a-f]*')
  ),
  CONSTRAINT chore_task_status_check CHECK(status IN ('pending','completed','cancelled'))
);
--> statement-breakpoint
INSERT INTO __new_chore_tasks SELECT * FROM chore_tasks;
--> statement-breakpoint
CREATE TABLE __new_chore_history_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dorm_id INTEGER NOT NULL REFERENCES dormitories(id),
  task_id INTEGER UNIQUE REFERENCES chore_tasks(id),
  assignee_id INTEGER NOT NULL REFERENCES users(id),
  key TEXT NOT NULL CHECK(
    key IN ('floor','toilet','sink','water') OR
    (length(key)=37 AND substr(key,1,5)='task_' AND substr(key,6) NOT GLOB '*[^0-9a-f]*')
  ),
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
--> statement-breakpoint
INSERT INTO __new_chore_history_entries SELECT * FROM chore_history_entries;
--> statement-breakpoint
DROP TABLE chore_categories;
--> statement-breakpoint
DROP TABLE chore_history_entries;
--> statement-breakpoint
DROP TABLE chore_tasks;
--> statement-breakpoint
ALTER TABLE __new_chore_categories RENAME TO chore_categories;
--> statement-breakpoint
ALTER TABLE __new_chore_tasks RENAME TO chore_tasks;
--> statement-breakpoint
ALTER TABLE __new_chore_history_entries RENAME TO chore_history_entries;
--> statement-breakpoint
CREATE UNIQUE INDEX chore_categories_dorm_key_unique ON chore_categories(dorm_id,key);
--> statement-breakpoint
CREATE UNIQUE INDEX chore_tasks_dorm_key_task_unique ON chore_tasks(dorm_id,key,task_key);
--> statement-breakpoint
CREATE INDEX chore_tasks_dorm_date_idx ON chore_tasks(dorm_id,duty_date);
--> statement-breakpoint
CREATE INDEX chore_tasks_completed_idx ON chore_tasks(dorm_id,completed_at);
--> statement-breakpoint
CREATE UNIQUE INDEX chore_water_pending_unique ON chore_tasks(dorm_id) WHERE key='water' AND status='pending';
--> statement-breakpoint
CREATE INDEX chore_history_dorm_time ON chore_history_entries(dorm_id,completed_at);
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
