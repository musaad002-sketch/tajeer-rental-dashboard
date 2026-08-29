ALTER TABLE `contractOperations` MODIFY COLUMN `paymentMethod` enum('cash','network','transfer','mixed');--> statement-breakpoint
ALTER TABLE `officeLiabilities` MODIFY COLUMN `paymentMethod` enum('cash','network','transfer','mixed') NULL;--> statement-breakpoint
ALTER TABLE `payments` MODIFY COLUMN `paymentMethod` enum('cash','network','transfer','mixed') NOT NULL;--> statement-breakpoint
ALTER TABLE `contracts` ADD `contractScope` enum('domestic_limited','domestic_open','international') DEFAULT 'domestic_open';