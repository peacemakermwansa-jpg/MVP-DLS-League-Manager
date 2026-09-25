CREATE TABLE `leaguePlayers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leagueId` int NOT NULL,
	`userId` int NOT NULL,
	`teamId` int,
	`playerName` varchar(120) NOT NULL,
	`username` varchar(64) NOT NULL,
	`profilePicture` text,
	`whatsappNumber` varchar(32),
	`registrationStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leaguePlayers_id` PRIMARY KEY(`id`),
	CONSTRAINT `league_players_league_user_unique` UNIQUE(`leagueId`,`userId`),
	CONSTRAINT `league_players_league_username_unique` UNIQUE(`leagueId`,`username`)
);
--> statement-breakpoint
ALTER TABLE `fixtures` ADD `deadline` timestamp;--> statement-breakpoint
ALTER TABLE `leaguePlayers` ADD CONSTRAINT `leaguePlayers_leagueId_leagues_id_fk` FOREIGN KEY (`leagueId`) REFERENCES `leagues`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leaguePlayers` ADD CONSTRAINT `leaguePlayers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leaguePlayers` ADD CONSTRAINT `leaguePlayers_teamId_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;