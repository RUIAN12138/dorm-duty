CREATE TABLE `creator_recovery` (
	`dorm_id` integer PRIMARY KEY NOT NULL,
	`owner_user_id` integer NOT NULL,
	`code_hash` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`dorm_id`) REFERENCES `dormitories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_recovery_hash_unique` ON `creator_recovery` (`code_hash`);