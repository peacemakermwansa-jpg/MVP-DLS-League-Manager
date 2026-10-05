ALTER TABLE `users` MODIFY COLUMN `role` enum('user','participant','admin') NOT NULL DEFAULT 'participant';--> statement-breakpoint
UPDATE `users` SET `role` = 'participant' WHERE `role` = 'user';--> statement-breakpoint
UPDATE `users` INNER JOIN `leagues` ON `leagues`.`createdBy` = `users`.`id` SET `users`.`role` = 'admin';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('participant','admin') NOT NULL DEFAULT 'participant';--> statement-breakpoint
ALTER TABLE `users` ADD `accountTypeSelected` boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `users` SET `accountTypeSelected` = true;