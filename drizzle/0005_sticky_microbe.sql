CREATE TABLE `fixtureResults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fixtureId` int NOT NULL,
	`submittedBy` int NOT NULL,
	`homeScore` int NOT NULL,
	`awayScore` int NOT NULL,
	`proofKey` text,
	`proofUrl` text,
	`status` enum('submitted','confirmed','disputed','cancelled') NOT NULL DEFAULT 'submitted',
	`confirmedBy` int,
	`disputedAt` timestamp,
	`resolvedAt` timestamp,
	`resolvedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fixtureResults_id` PRIMARY KEY(`id`),
	CONSTRAINT `fixtureResults_fixtureId_unique` UNIQUE(`fixtureId`)
);
--> statement-breakpoint
ALTER TABLE `fixtures` MODIFY COLUMN `status` enum('pending','completed','scheduled','result_submitted','confirmed','disputed') NOT NULL DEFAULT 'scheduled';
--> statement-breakpoint
UPDATE `fixtures` SET `status` = 'scheduled' WHERE `status` = 'pending';
--> statement-breakpoint
UPDATE `fixtures` SET `status` = 'confirmed' WHERE `status` = 'completed';
--> statement-breakpoint
ALTER TABLE `fixtures` MODIFY COLUMN `status` enum('scheduled','result_submitted','confirmed','disputed') NOT NULL DEFAULT 'scheduled';--> statement-breakpoint
ALTER TABLE `fixtureResults` ADD CONSTRAINT `fixtureResults_fixtureId_fixtures_id_fk` FOREIGN KEY (`fixtureId`) REFERENCES `fixtures`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fixtureResults` ADD CONSTRAINT `fixtureResults_submittedBy_users_id_fk` FOREIGN KEY (`submittedBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fixtureResults` ADD CONSTRAINT `fixtureResults_confirmedBy_users_id_fk` FOREIGN KEY (`confirmedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fixtureResults` ADD CONSTRAINT `fixtureResults_resolvedBy_users_id_fk` FOREIGN KEY (`resolvedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
