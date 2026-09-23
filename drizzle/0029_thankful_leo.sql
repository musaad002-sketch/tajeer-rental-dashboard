CREATE TABLE `financialExpenseDetails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`liabilityId` int NOT NULL,
	`expenseType` enum('parts','labor','external_workshop','freon','glass','warranty','other') NOT NULL,
	`partType` varchar(160),
	`vehicleId` int,
	`paymentMethod` enum('cash','network','transfer','mixed'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financialExpenseDetails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financialPaymentAllocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` int NOT NULL,
	`paymentId` int,
	`contractId` int,
	`allocationType` enum('remaining_contract_balance','current_late_charges','excess_mileage','other_liability') NOT NULL,
	`priority` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financialPaymentAllocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `financial_allocations_transaction_type_uq` UNIQUE(`transactionId`,`allocationType`)
);
--> statement-breakpoint
CREATE TABLE `financialTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionType` enum('payment','revenue','expense') NOT NULL,
	`approvalStatus` enum('pending','approved','rejected','legacy_accepted') NOT NULL DEFAULT 'pending',
	`amount` decimal(10,2) NOT NULL,
	`paymentMethod` enum('cash','network','transfer','mixed'),
	`settlementType` enum('suspended_contract','previous_contract','non_suspended_contract','unlinked') NOT NULL DEFAULT 'unlinked',
	`revenueType` enum('rental','insurance_deductible','accident_compensation','other'),
	`contractId` int,
	`customerId` int,
	`vehicleId` int,
	`createdBy` int,
	`approvedBy` int,
	`approvedAt` timestamp,
	`rejectionReason` varchar(240),
	`originalTransactionId` int,
	`reversalOfTransactionId` int,
	`correctionOfTransactionId` int,
	`sourceTable` varchar(40),
	`sourceId` int,
	`description` varchar(240),
	`metadata` text,
	`transactionDate` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financialTransactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `officeLiabilities` MODIFY COLUMN `expenseApprovalStatus` enum('pending','approved','rejected','legacy_accepted') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `officeLiabilities` ADD `rejectionReason` varchar(240);--> statement-breakpoint
ALTER TABLE `officeLiabilities` ADD `originalTransactionId` int;--> statement-breakpoint
ALTER TABLE `officeLiabilities` ADD `reversalOfLiabilityId` int;--> statement-breakpoint
ALTER TABLE `officeLiabilities` ADD `correctionOfLiabilityId` int;--> statement-breakpoint
ALTER TABLE `officeLiabilities` ADD `legacyAcceptedAt` timestamp;--> statement-breakpoint
ALTER TABLE `payments` ADD `approvalStatus` enum('pending','approved','rejected','legacy_accepted') DEFAULT 'legacy_accepted' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `payments` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `payments` ADD `rejectionReason` varchar(240);--> statement-breakpoint
ALTER TABLE `payments` ADD `originalTransactionId` int;--> statement-breakpoint
ALTER TABLE `payments` ADD `reversalOfPaymentId` int;--> statement-breakpoint
ALTER TABLE `payments` ADD `correctionOfPaymentId` int;--> statement-breakpoint
ALTER TABLE `payments` ADD `settlementType` enum('suspended_contract','previous_contract','non_suspended_contract','unlinked') DEFAULT 'unlinked' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `paymentReason` varchar(80);--> statement-breakpoint
CREATE INDEX `financial_expense_details_liability_idx` ON `financialExpenseDetails` (`liabilityId`);--> statement-breakpoint
CREATE INDEX `financial_expense_details_vehicle_type_idx` ON `financialExpenseDetails` (`vehicleId`,`expenseType`);--> statement-breakpoint
CREATE INDEX `financial_allocations_transaction_priority_idx` ON `financialPaymentAllocations` (`transactionId`,`priority`);--> statement-breakpoint
CREATE INDEX `financial_allocations_contract_type_idx` ON `financialPaymentAllocations` (`contractId`,`allocationType`);--> statement-breakpoint
CREATE INDEX `financial_allocations_payment_idx` ON `financialPaymentAllocations` (`paymentId`);--> statement-breakpoint
CREATE INDEX `financial_transactions_approval_type_idx` ON `financialTransactions` (`approvalStatus`,`transactionType`);--> statement-breakpoint
CREATE INDEX `financial_transactions_contract_date_idx` ON `financialTransactions` (`contractId`,`transactionDate`);--> statement-breakpoint
CREATE INDEX `financial_transactions_customer_date_idx` ON `financialTransactions` (`customerId`,`transactionDate`);--> statement-breakpoint
CREATE INDEX `financial_transactions_vehicle_date_idx` ON `financialTransactions` (`vehicleId`,`transactionDate`);--> statement-breakpoint
CREATE INDEX `financial_transactions_source_idx` ON `financialTransactions` (`sourceTable`,`sourceId`);--> statement-breakpoint
CREATE INDEX `financial_transactions_original_idx` ON `financialTransactions` (`originalTransactionId`);--> statement-breakpoint
CREATE INDEX `financial_transactions_reversal_idx` ON `financialTransactions` (`reversalOfTransactionId`);--> statement-breakpoint
CREATE INDEX `financial_transactions_correction_idx` ON `financialTransactions` (`correctionOfTransactionId`);--> statement-breakpoint
CREATE INDEX `liabilities_approval_created_idx` ON `officeLiabilities` (`expenseApprovalStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `liabilities_original_transaction_idx` ON `officeLiabilities` (`originalTransactionId`);--> statement-breakpoint
CREATE INDEX `liabilities_reversal_of_idx` ON `officeLiabilities` (`reversalOfLiabilityId`);--> statement-breakpoint
CREATE INDEX `liabilities_correction_of_idx` ON `officeLiabilities` (`correctionOfLiabilityId`);--> statement-breakpoint
CREATE INDEX `payments_approval_created_idx` ON `payments` (`approvalStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `payments_original_transaction_idx` ON `payments` (`originalTransactionId`);--> statement-breakpoint
CREATE INDEX `payments_reversal_of_payment_idx` ON `payments` (`reversalOfPaymentId`);--> statement-breakpoint
CREATE INDEX `payments_correction_of_payment_idx` ON `payments` (`correctionOfPaymentId`);--> statement-breakpoint
CREATE INDEX `payments_settlement_contract_idx` ON `payments` (`settlementType`,`contractId`);