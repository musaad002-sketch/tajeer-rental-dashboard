CREATE TABLE `backupRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskUid` varchar(65) NOT NULL,
	`runKey` varchar(160) NOT NULL,
	`backupRunStatus` enum('started','succeeded','failed') NOT NULL DEFAULT 'started',
	`generatedAt` timestamp NOT NULL,
	`sentAt` timestamp,
	`backupKey` text,
	`dailyReportKey` text,
	`monthlyReportKey` text,
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backupRuns_id` PRIMARY KEY(`id`),
	CONSTRAINT `backupRuns_runKey_unique` UNIQUE(`runKey`)
);
--> statement-breakpoint
CREATE INDEX `backup_runs_task_idx` ON `backupRuns` (`taskUid`);--> statement-breakpoint
CREATE INDEX `backup_runs_run_key_idx` ON `backupRuns` (`runKey`);