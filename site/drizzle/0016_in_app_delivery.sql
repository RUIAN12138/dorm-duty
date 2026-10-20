-- A foreground delivery receipt is independent of whether a message is read.
ALTER TABLE chore_reminders ADD COLUMN in_app_received_at TEXT;
