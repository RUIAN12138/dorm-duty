CREATE TABLE `chore_push_jobs` (
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
	FOREIGN KEY (`reminder_id`) REFERENCES `chore_reminders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chore_push_kind_check" CHECK("chore_push_jobs"."kind" IN ('reminder','test')),
	CONSTRAINT "chore_push_status_check" CHECK("chore_push_jobs"."status" IN ('pending','sending','accepted','failed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_push_reminder_device_unique` ON `chore_push_jobs` (`reminder_id`,`subscription_id`);--> statement-breakpoint
CREATE INDEX `chore_push_queue_idx` ON `chore_push_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `chore_push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dorm_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_push_endpoint_unique` ON `chore_push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `chore_push_member_idx` ON `chore_push_subscriptions` (`dorm_id`,`user_id`,`is_active`);