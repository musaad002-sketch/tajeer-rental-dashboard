CREATE TABLE `monthlyInstallments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`monthNumber` int NOT NULL,
	`cycleStart` datetime NOT NULL,
	`cycleEnd` datetime NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`paidAmount` decimal(10,2) NOT NULL DEFAULT '0',
	`monthlyInstallmentStatus` enum('unpaid','partially_paid','fully_paid') NOT NULL DEFAULT 'unpaid',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthlyInstallments_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_installments_contract_month_uq` UNIQUE(`contractId`,`monthNumber`)
);
--> statement-breakpoint
CREATE INDEX `monthly_installments_contract_month_idx` ON `monthlyInstallments` (`contractId`,`monthNumber`);--> statement-breakpoint
CREATE INDEX `monthly_installments_contract_status_idx` ON `monthlyInstallments` (`contractId`,`monthlyInstallmentStatus`);