import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the existing Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** A competition/season belongs to exactly one authenticated user. */
export const leagues = mysqlTable("leagues", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  seasonName: varchar("seasonName", { length: 120 }).notNull(),
  numberOfTeams: int("numberOfTeams").notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type League = typeof leagues.$inferSelect;
export type InsertLeague = typeof leagues.$inferInsert;

/** Teams are scoped to a league so one manager can participate in multiple seasons. */
export const teams = mysqlTable("teams", {
  id: int("id").autoincrement().primaryKey(),
  leagueId: int("leagueId").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  managerName: varchar("managerName", { length: 120 }).notNull(),
  logoUrl: text("logoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ leagueNameUnique: uniqueIndex("teams_league_name_unique").on(table.leagueId, table.name) }));
export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;

/** One scheduled home/away pairing. Scores are null until the result is saved. */
export const fixtures = mysqlTable("fixtures", {
  id: int("id").autoincrement().primaryKey(),
  leagueId: int("leagueId").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  round: int("round").notNull(),
  homeTeamId: int("homeTeamId").notNull().references(() => teams.id, { onDelete: "cascade" }),
  awayTeamId: int("awayTeamId").notNull().references(() => teams.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["pending", "completed"]).default("pending").notNull(),
  homeScore: int("homeScore"),
  awayScore: int("awayScore"),
  deadline: timestamp("deadline"),
  playedAt: timestamp("playedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ fixtureUnique: uniqueIndex("fixtures_round_pairing_unique").on(table.leagueId, table.round, table.homeTeamId, table.awayTeamId) }));
export type Fixture = typeof fixtures.$inferSelect;
export type InsertFixture = typeof fixtures.$inferInsert;

/** A user's participation in one league. The same account may have one profile per league. */
export const leaguePlayers = mysqlTable("leaguePlayers", {
  id: int("id").autoincrement().primaryKey(),
  leagueId: int("leagueId").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: int("teamId").references(() => teams.id, { onDelete: "set null" }),
  playerName: varchar("playerName", { length: 120 }).notNull(),
  username: varchar("username", { length: 64 }).notNull(),
  profilePicture: text("profilePicture"),
  whatsappNumber: varchar("whatsappNumber", { length: 32 }),
  registrationStatus: mysqlEnum("registrationStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ leagueUserUnique: uniqueIndex("league_players_league_user_unique").on(table.leagueId, table.userId), leagueUsernameUnique: uniqueIndex("league_players_league_username_unique").on(table.leagueId, table.username) }));
export type LeaguePlayer = typeof leaguePlayers.$inferSelect;
export type InsertLeaguePlayer = typeof leaguePlayers.$inferInsert;
