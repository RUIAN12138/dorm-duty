-- Add the new mode without rebuilding existing tables or completed history.
ALTER TABLE chore_categories ADD COLUMN mode TEXT NOT NULL DEFAULT 'self_round'
  CONSTRAINT chore_category_mode_check CHECK(mode IN ('scheduled','self_round','completion'));
--> statement-breakpoint
UPDATE chore_categories SET mode='completion' WHERE key='water';
--> statement-breakpoint
-- Unfinished daily assignments are replaced by independent voluntary rounds.
-- Completed tasks, their timestamps and reminder snapshots stay unchanged.
UPDATE chore_tasks SET status='cancelled' WHERE key IN ('floor','toilet') AND status='pending';
--> statement-breakpoint
UPDATE chore_settings SET version=version+1;
