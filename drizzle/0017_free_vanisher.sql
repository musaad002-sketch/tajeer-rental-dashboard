CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`salary` decimal(10,2) NOT NULL,
	`hireDate` date NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expenseTypes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`recurrence` enum('one_time','monthly','quarterly','semiannual','annual') NOT NULL DEFAULT 'one_time',
	`defaultAmount` decimal(10,2) NOT NULL DEFAULT '0',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expenseTypes_id` PRIMARY KEY(`id`),
	CONSTRAINT `expenseTypes_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `officeLiabilities` ADD `expenseTypeId` int;--> statement-breakpoint
ALTER TABLE `officeLiabilities` ADD `employeeId` int;