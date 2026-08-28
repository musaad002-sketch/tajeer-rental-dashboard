CREATE TABLE `officeLiabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(100) NOT NULL,
	`description` varchar(240) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`paidAmount` decimal(10,2) NOT NULL DEFAULT '0',
	`dueDate` date,
	`liabilityStatus` enum('open','partially_paid','paid','cancelled') NOT NULL DEFAULT 'open',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `officeLiabilities_id` PRIMARY KEY(`id`)
);
