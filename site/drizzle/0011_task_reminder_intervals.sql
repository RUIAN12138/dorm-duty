ALTER TABLE chore_categories ADD COLUMN reminder_interval_days INTEGER NOT NULL DEFAULT 3 CHECK (reminder_interval_days BETWEEN 1 AND 365);
