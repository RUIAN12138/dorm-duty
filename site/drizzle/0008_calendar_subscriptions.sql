CREATE TABLE `chore_calendar_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dorm_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text,
	`enabled` integer DEFAULT false NOT NULL,
	`include_alarms` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_fetched_at` text,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_calendar_member_unique` ON `chore_calendar_subscriptions` (`dorm_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chore_calendar_token_unique` ON `chore_calendar_subscriptions` (`token_hash`);
--> statement-breakpoint
CREATE TRIGGER chore_calendar_revoke_on_leave AFTER UPDATE OF is_active ON dorm_members
WHEN OLD.is_active=1 AND NEW.is_active=0
BEGIN
  UPDATE chore_calendar_subscriptions SET enabled=0,token_hash=NULL,version=version+1,last_fetched_at=NULL,updated_at=COALESCE(NEW.left_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE dorm_id=NEW.dorm_id AND user_id=NEW.user_id AND enabled=1;
END;
--> statement-breakpoint
CREATE TRIGGER chore_calendar_revoke_on_room_change AFTER UPDATE OF current_dorm_id ON users
WHEN OLD.current_dorm_id IS NOT NEW.current_dorm_id
BEGIN
  UPDATE chore_calendar_subscriptions SET enabled=0,token_hash=NULL,version=version+1,last_fetched_at=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE user_id=NEW.id AND enabled=1 AND dorm_id IS NOT NEW.current_dorm_id;
END;
