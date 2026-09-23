CREATE TABLE `vehicleReadiness` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int NOT NULL,
	`vehicleReadinessState` enum('returned','cleaning','qc','ready','blocked') NOT NULL DEFAULT 'ready',
	`blockedReason` varchar(240),
	`notes` text,
	`changedBy` int NOT NULL,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vehicleReadiness_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `vehicle_readiness_vehicle_idx` ON `vehicleReadiness` (`vehicleId`);--> statement-breakpoint
CREATE INDEX `vehicle_readiness_state_idx` ON `vehicleReadiness` (`vehicleReadinessState`);--> statement-breakpoint
CREATE INDEX `vehicle_readiness_changed_at_idx` ON `vehicleReadiness` (`changedAt`);