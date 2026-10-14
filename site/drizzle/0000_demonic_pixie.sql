CREATE TABLE `dorm_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dorm_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`sort_order` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`joined_at` text NOT NULL,
	`left_at` text,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "member_role_check" CHECK("dorm_members"."role" IN ('admin','member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dorm_member_unique` ON `dorm_members` (`dorm_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `dorm_members_dorm_idx` ON `dorm_members` (`dorm_id`);--> statement-breakpoint
CREATE TABLE `dormitories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`admin_user_id` integer NOT NULL,
	`rotation_order` text DEFAULT '[]' NOT NULL,
	`rotation_start_date` text NOT NULL,
	`deadline_time` text DEFAULT '22:00' NOT NULL,
	`task_text` text DEFAULT '扫地、拖地、倒垃圾' NOT NULL,
	`schedule_rules` text DEFAULT '{}' NOT NULL,
	`schedule_version` integer DEFAULT 1 NOT NULL,
	`mutation_key` text DEFAULT '' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dormitories_invite_code_unique` ON `dormitories` (`invite_code`);--> statement-breakpoint
CREATE TABLE `duty_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dorm_id` integer NOT NULL,
	`duty_date` text NOT NULL,
	`assignee_id` integer NOT NULL,
	`assignee_name_snapshot` text NOT NULL,
	`task_text` text NOT NULL,
	`deadline_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`completed_at` text,
	`is_override` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "duty_status_check" CHECK("duty_tasks"."status" IN ('pending','completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dorm_duty_day_unique` ON `duty_tasks` (`dorm_id`,`duty_date`);--> statement-breakpoint
CREATE INDEX `duty_tasks_dorm_date_idx` ON `duty_tasks` (`dorm_id`,`duty_date`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`dorm_id` integer,
	`task_id` integer,
	`reminder_kind` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`read_at` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`is_cancelled` integer DEFAULT false NOT NULL,
	`delivery_state` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `duty_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_key_unique` ON `notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	`kind` text DEFAULT 'account' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "session_kind_check" CHECK("sessions"."kind" IN ('account','device'))
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`nickname` text NOT NULL,
	`current_dorm_id` integer,
	`push_enabled` integer DEFAULT false NOT NULL,
	`mutation_key` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`current_dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);