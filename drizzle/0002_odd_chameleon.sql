UPDATE `leagues` SET `createdBy` = (SELECT `id` FROM `users` ORDER BY `id` LIMIT 1) WHERE `createdBy` IS NULL;--> statement-breakpoint
ALTER TABLE `leagues` MODIFY COLUMN `createdBy` int NOT NULL;--> statement-breakpoint
ALTER TABLE `leagues` ADD CONSTRAINT `leagues_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
