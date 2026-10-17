-- Retire independent device credentials; mailbox-owned room grants remain usable.
ALTER TABLE sessions ADD COLUMN dorm_id INTEGER REFERENCES dormitories(id);
UPDATE sessions SET dorm_id=(SELECT current_dorm_id FROM users WHERE users.id=sessions.user_id);
DELETE FROM email_grants WHERE token_hash IN (SELECT token_hash FROM sessions WHERE kind='device');
DELETE FROM sessions WHERE kind='device';
CREATE TABLE runtime_metrics (
  name TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
