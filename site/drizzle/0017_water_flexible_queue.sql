CREATE TABLE chore_water_flow (
  dorm_id INTEGER PRIMARY KEY REFERENCES dormitories(id),
  queue TEXT NOT NULL DEFAULT '[]',
  handoff TEXT,
  undo_state TEXT
);
--> statement-breakpoint
CREATE TABLE chore_water_credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dorm_id INTEGER NOT NULL REFERENCES dormitories(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  task_id INTEGER NOT NULL UNIQUE REFERENCES chore_tasks(id),
  status TEXT NOT NULL CHECK(status IN ('pending','consumed','cancelled')),
  consumed_by INTEGER REFERENCES chore_tasks(id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX chore_water_credit_pending ON chore_water_credits(dorm_id,user_id) WHERE status='pending';
--> statement-breakpoint
CREATE TABLE chore_water_skips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dorm_id INTEGER NOT NULL REFERENCES dormitories(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  task_id INTEGER NOT NULL UNIQUE REFERENCES chore_tasks(id),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
