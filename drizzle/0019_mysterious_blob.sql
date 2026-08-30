ALTER TABLE `officeLiabilities` ADD `expenseApprovalStatus` enum('pending','approved','rejected') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `officeLiabilities` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `officeLiabilities` ADD `approvedAt` timestamp;