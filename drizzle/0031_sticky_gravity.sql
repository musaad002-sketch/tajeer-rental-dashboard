ALTER TABLE `contracts` MODIFY COLUMN `startDate` datetime NOT NULL;--> statement-breakpoint
ALTER TABLE `contracts` MODIFY COLUMN `expectedReturnDate` datetime NOT NULL;--> statement-breakpoint
ALTER TABLE `contracts` MODIFY COLUMN `actualReturnDate` datetime;--> statement-breakpoint
ALTER TABLE `maintenanceRecords` MODIFY COLUMN `startDate` datetime NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenanceRecords` MODIFY COLUMN `endDate` datetime;