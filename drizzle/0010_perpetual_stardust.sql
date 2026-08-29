CREATE TABLE `deletionAudits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(32) NOT NULL,
	`entityId` int NOT NULL,
	`contractId` int,
	`snapshot` text NOT NULL,
	`reason` varchar(240) NOT NULL,
	`deletedBy` int,
	`deletedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deletionAudits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `deletion_audits_contract_idx` ON `deletionAudits` (`contractId`);