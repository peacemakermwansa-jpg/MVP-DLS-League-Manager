ALTER TABLE `users` ADD `playerId` int;
--> statement-breakpoint
UPDATE `users` SET `playerId` = 100000 + `id` WHERE `playerId` IS NULL;
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `playerId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_playerId_unique` UNIQUE(`playerId`);
