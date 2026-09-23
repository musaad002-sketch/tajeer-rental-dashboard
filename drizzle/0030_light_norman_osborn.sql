CREATE TABLE `vehicleNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int NOT NULL,
	`sourceContractId` int,
	`sourceCustomerId` int,
	`note` text NOT NULL,
	`vehicleNoteResolution` enum('open','repaired','not_repaired','not_needed') NOT NULL DEFAULT 'open',
	`resolutionReason` varchar(240),
	`createdBy` int,
	`resolvedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`managerFollowUpRequired` boolean NOT NULL DEFAULT false,
	`managerFollowUpAt` timestamp,
	CONSTRAINT `vehicleNotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `vehicle_notes_vehicle_resolution_idx` ON `vehicleNotes` (`vehicleId`,`vehicleNoteResolution`);--> statement-breakpoint
CREATE INDEX `vehicle_notes_source_contract_idx` ON `vehicleNotes` (`sourceContractId`);--> statement-breakpoint
CREATE INDEX `vehicle_notes_source_customer_idx` ON `vehicleNotes` (`sourceCustomerId`);