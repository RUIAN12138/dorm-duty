CREATE TABLE dorm_configurations (
 dorm_id INTEGER PRIMARY KEY REFERENCES dormitories(id),
 schema_version INTEGER NOT NULL CHECK(schema_version=2),
 configuration TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
ALTER TABLE chore_tasks ADD COLUMN completed_by INTEGER REFERENCES users(id);
