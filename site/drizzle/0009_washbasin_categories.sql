-- Preserve existing rows and IDs while widening the category key checks.
-- Reminder delivery and calendar reminder tables reference these records, so
-- rebuild that dependency chain in one deferred-FK migration transaction.
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE `__new_chore_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dorm_id` integer NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`deadline_time` text NOT NULL,
	`start_date` text NOT NULL,
	`weekdays` text DEFAULT '[1,2,3,4,5,6,7]' NOT NULL,
	`rotation_days` integer DEFAULT 1 NOT NULL,
	`rotation_order` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`mode` text DEFAULT 'self_round' NOT NULL,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `chore_category_mode_check` CHECK(`mode` IN ('scheduled','self_round','completion')),
	CONSTRAINT `chore_category_key_check` CHECK(`key` IN ('floor','toilet','sink','water')),
	CONSTRAINT `chore_rotation_days_check` CHECK(`rotation_days` BETWEEN 1 AND 30)
);
--> statement-breakpoint
INSERT INTO `__new_chore_categories` SELECT * FROM `chore_categories`;
--> statement-breakpoint
CREATE TABLE `__new_chore_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dorm_id` integer NOT NULL,
	`key` text NOT NULL,
	`task_key` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`duty_date` text NOT NULL,
	`assignee_id` integer NOT NULL,
	`assignee_name_snapshot` text NOT NULL,
	`marker_id_snapshot` text NOT NULL,
	`deadline_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`completed_at` text,
	`sequence` integer,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `chore_task_key_check` CHECK(`key` IN ('floor','toilet','sink','water')),
	CONSTRAINT `chore_task_status_check` CHECK(`status` IN ('pending','completed','cancelled'))
);
--> statement-breakpoint
INSERT INTO `__new_chore_tasks` SELECT * FROM `chore_tasks`;
--> statement-breakpoint
CREATE TABLE `__new_chore_reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dorm_id` integer NOT NULL,
	`sender_id` integer NOT NULL,
	`sender_name_snapshot` text NOT NULL,
	`target_member_id` integer NOT NULL,
	`task_id` integer,
	`task_name_snapshot` text NOT NULL,
	`task_content_snapshot` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`read_at` text,
	`mutation_key` text NOT NULL,
	`source` text DEFAULT 'member' NOT NULL,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_member_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `__new_chore_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_chore_reminders` SELECT * FROM `chore_reminders`;
--> statement-breakpoint
CREATE TABLE `__new_chore_scheduled_reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`preference_id` integer NOT NULL,
	`preference_version` integer NOT NULL,
	`reminder_id` integer NOT NULL,
	`day` text NOT NULL,
	`time` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`task_ids` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`preference_id`) REFERENCES `chore_reminder_preferences`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reminder_id`) REFERENCES `__new_chore_reminders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_chore_scheduled_reminders` SELECT * FROM `chore_scheduled_reminders`;
--> statement-breakpoint
CREATE TABLE `__new_chore_push_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dorm_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`subscription_id` integer NOT NULL,
	`subscription_revision` integer NOT NULL,
	`reminder_id` integer,
	`kind` text DEFAULT 'reminder' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`lease` text,
	`lease_until` text,
	`accepted_at` text,
	`last_status` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `chore_push_subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reminder_id`) REFERENCES `__new_chore_reminders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `chore_push_kind_check` CHECK(`kind` IN ('reminder','test')),
	CONSTRAINT `chore_push_status_check` CHECK(`status` IN ('pending','sending','accepted','failed','cancelled'))
);
--> statement-breakpoint
INSERT INTO `__new_chore_push_jobs` SELECT * FROM `chore_push_jobs`;
--> statement-breakpoint
DROP TABLE `chore_push_jobs`;
--> statement-breakpoint
DROP TABLE `chore_scheduled_reminders`;
--> statement-breakpoint
DROP TABLE `chore_reminders`;
--> statement-breakpoint
DROP TABLE `chore_tasks`;
--> statement-breakpoint
DROP TABLE `chore_categories`;
--> statement-breakpoint
ALTER TABLE `__new_chore_categories` RENAME TO `chore_categories`;
--> statement-breakpoint
ALTER TABLE `__new_chore_tasks` RENAME TO `chore_tasks`;
--> statement-breakpoint
ALTER TABLE `__new_chore_reminders` RENAME TO `chore_reminders`;
--> statement-breakpoint
ALTER TABLE `__new_chore_scheduled_reminders` RENAME TO `chore_scheduled_reminders`;
--> statement-breakpoint
ALTER TABLE `__new_chore_push_jobs` RENAME TO `chore_push_jobs`;
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_categories_dorm_key_unique` ON `chore_categories` (`dorm_id`,`key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_tasks_dorm_key_task_unique` ON `chore_tasks` (`dorm_id`,`key`,`task_key`);
--> statement-breakpoint
CREATE INDEX `chore_tasks_dorm_date_idx` ON `chore_tasks` (`dorm_id`,`duty_date`);
--> statement-breakpoint
CREATE INDEX `chore_tasks_completed_idx` ON `chore_tasks` (`dorm_id`,`completed_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_water_pending_unique` ON `chore_tasks` (`dorm_id`) WHERE `key`='water' AND `status`='pending';
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_reminders_mutation_key_unique` ON `chore_reminders` (`mutation_key`);
--> statement-breakpoint
CREATE INDEX `chore_reminders_target_idx` ON `chore_reminders` (`dorm_id`,`target_member_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `chore_reminders_cooldown_idx` ON `chore_reminders` (`sender_id`,`target_member_id`,`task_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_schedule_slot_unique` ON `chore_scheduled_reminders` (`preference_id`,`day`,`time`);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_schedule_reminder_unique` ON `chore_scheduled_reminders` (`reminder_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_push_reminder_device_unique` ON `chore_push_jobs` (`reminder_id`,`subscription_id`);
--> statement-breakpoint
CREATE INDEX `chore_push_queue_idx` ON `chore_push_jobs` (`status`,`next_attempt_at`);
