ALTER TABLE `users` ADD `passwordResetTokenHash` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordResetExpiresAt` timestamp;