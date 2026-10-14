CREATE TABLE `chore_categories` (
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
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chore_category_key_check" CHECK("chore_categories"."key" IN ('floor','toilet','water')),
	CONSTRAINT "chore_rotation_days_check" CHECK("chore_categories"."rotation_days" BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_categories_dorm_key_unique` ON `chore_categories` (`dorm_id`,`key`);--> statement-breakpoint
CREATE TABLE `chore_reminders` (
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
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_member_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `chore_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_reminders_mutation_key_unique` ON `chore_reminders` (`mutation_key`);--> statement-breakpoint
CREATE INDEX `chore_reminders_target_idx` ON `chore_reminders` (`dorm_id`,`target_member_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `chore_reminders_cooldown_idx` ON `chore_reminders` (`sender_id`,`target_member_id`,`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chore_settings` (
	`dorm_id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`mutation_key` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chore_tasks` (
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
	CONSTRAINT "chore_task_key_check" CHECK("chore_tasks"."key" IN ('floor','toilet','water')),
	CONSTRAINT "chore_task_status_check" CHECK("chore_tasks"."status" IN ('pending','completed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_tasks_dorm_key_task_unique` ON `chore_tasks` (`dorm_id`,`key`,`task_key`);--> statement-breakpoint
CREATE INDEX `chore_tasks_dorm_date_idx` ON `chore_tasks` (`dorm_id`,`duty_date`);--> statement-breakpoint
CREATE INDEX `chore_tasks_completed_idx` ON `chore_tasks` (`dorm_id`,`completed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `chore_water_pending_unique` ON `chore_tasks` (`dorm_id`) WHERE "chore_tasks"."key"='water' AND "chore_tasks"."status"='pending';--> statement-breakpoint
CREATE TABLE `member_marks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dorm_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`marker_id` text NOT NULL,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_marks_user_unique` ON `member_marks` (`dorm_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_marks_marker_unique` ON `member_marks` (`dorm_id`,`marker_id`);--> statement-breakpoint
CREATE TABLE `member_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`dorm_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `member_sessions_dorm_user_idx` ON `member_sessions` (`dorm_id`,`user_id`);