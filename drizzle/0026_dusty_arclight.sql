CREATE TABLE `blockedCustomers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`identityNumber` varchar(64),
	`phone` varchar(32),
	`nationality` varchar(64),
	`reason` text,
	`source` varchar(160),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blockedCustomers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `siteContent` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contentKey` varchar(160) NOT NULL,
	`contentType` varchar(20) NOT NULL,
	`value` text NOT NULL,
	`originalValue` text NOT NULL,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `siteContent_id` PRIMARY KEY(`id`),
	CONSTRAINT `siteContent_contentKey_unique` UNIQUE(`contentKey`)
);
--> statement-breakpoint
CREATE INDEX `blocked_customers_identity_idx` ON `blockedCustomers` (`identityNumber`);--> statement-breakpoint
CREATE INDEX `blocked_customers_name_idx` ON `blockedCustomers` (`fullName`);