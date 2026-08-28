CREATE TABLE `contractOperations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`operationType` enum('new_contract','extension','payment','vehicle_swap','suspend','close','return') NOT NULL,
	`vehicleId` int,
	`amount` decimal(10,2) NOT NULL DEFAULT '0',
	`paymentMethod` enum('cash','network','transfer'),
	`details` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contractOperations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractNumber` varchar(32) NOT NULL,
	`customerId` int NOT NULL,
	`vehicleId` int NOT NULL,
	`contractType` enum('daily','monthly') NOT NULL,
	`contractStatus` enum('active','overdue','suspended','closed','returned') NOT NULL DEFAULT 'active',
	`startDate` date NOT NULL,
	`expectedReturnDate` date NOT NULL,
	`actualReturnDate` date,
	`rentalAmount` decimal(10,2) NOT NULL,
	`days` int NOT NULL DEFAULT 1,
	`totalAmount` decimal(10,2) NOT NULL,
	`paidAmount` decimal(10,2) NOT NULL DEFAULT '0',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contracts_contractNumber_unique` UNIQUE(`contractNumber`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`identityNumber` varchar(64) NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`email` varchar(320),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_identityNumber_unique` UNIQUE(`identityNumber`)
);
--> statement-breakpoint
CREATE TABLE `maintenanceRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int NOT NULL,
	`issueType` varchar(160) NOT NULL,
	`maintenanceStatus` enum('pending','in_progress','completed','written_off') NOT NULL DEFAULT 'pending',
	`startDate` date NOT NULL,
	`endDate` date,
	`cost` decimal(10,2) NOT NULL DEFAULT '0',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenanceRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`customerId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`paymentMethod` enum('cash','network','transfer') NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`plateNumber` varchar(32) NOT NULL,
	`make` varchar(80) NOT NULL,
	`model` varchar(80) NOT NULL,
	`modelYear` int NOT NULL,
	`dailyRate` decimal(10,2) NOT NULL,
	`monthlyRate` decimal(10,2) NOT NULL,
	`mileage` int NOT NULL DEFAULT 0,
	`vehicleStatus` enum('available','reserved','rented','maintenance','unavailable') NOT NULL DEFAULT 'available',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicles_plateNumber_unique` UNIQUE(`plateNumber`)
);
--> statement-breakpoint
CREATE INDEX `operations_contract_idx` ON `contractOperations` (`contractId`);--> statement-breakpoint
CREATE INDEX `contracts_status_idx` ON `contracts` (`contractStatus`);--> statement-breakpoint
CREATE INDEX `contracts_customer_idx` ON `contracts` (`customerId`);--> statement-breakpoint
CREATE INDEX `contracts_vehicle_idx` ON `contracts` (`vehicleId`);--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`fullName`);--> statement-breakpoint
CREATE INDEX `payments_contract_idx` ON `payments` (`contractId`);--> statement-breakpoint
CREATE INDEX `payments_customer_idx` ON `payments` (`customerId`);--> statement-breakpoint
CREATE INDEX `vehicles_status_idx` ON `vehicles` (`vehicleStatus`);