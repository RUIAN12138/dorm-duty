CREATE TABLE `chore_reminder_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dorm_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`times` text DEFAULT '["08:00","19:00"]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_reminder_preferences_member_unique` ON `chore_reminder_preferences` (`dorm_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `chore_scheduled_reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`preference_id` integer NOT NULL,
	`preference_version` integer NOT NULL,
	`reminder_id` integer NOT NULL,
	`day` text NOT NULL,
	`time` text NOT NULL,
	`scheduled_at` text NOT NULL,
	FOREIGN KEY (`preference_id`) REFERENCES `chore_reminder_preferences`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reminder_id`) REFERENCES `chore_reminders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_schedule_slot_unique` ON `chore_scheduled_reminders` (`preference_id`,`day`,`time`);--> statement-breakpoint
CREATE UNIQUE INDEX `chore_schedule_reminder_unique` ON `chore_scheduled_reminders` (`reminder_id`);--> statement-breakpoint
ALTER TABLE `chore_reminders` ADD `source` text DEFAULT 'member' NOT NULL;