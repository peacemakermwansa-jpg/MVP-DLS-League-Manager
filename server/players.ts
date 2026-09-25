import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { fixtures, leaguePlayers, leagues, teams, users } from "../drizzle/schema";
import { calculateStandings } from "./league";
import { getDb } from "./db";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
  return db;
}

async function requireOwnedLeague(db: Awaited<ReturnType<typeof requireDb>>, leagueId: number, userId: number) {
  const rows = await db.select().from(leagues).where(and(eq(leagues.id, leagueId), eq(leagues.createdBy, userId))).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "League not found." });
  return rows[0];
}

async function getMembership(db: Awaited<ReturnType<typeof requireDb>>, leagueId: number, userId: number) {
  const rows = await db.select().from(leaguePlayers).where(and(eq(leaguePlayers.leagueId, leagueId), eq(leaguePlayers.userId, userId))).limit(1);
  return rows[0];
}

export async function applyToLeague(input: { leagueId: number; playerName: string; username: string; profilePicture?: string; whatsappNumber?: string; userId: number }) {
  const db = await requireDb();
  const leagueRows = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.id, input.leagueId)).limit(1);
  if (!leagueRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "League not found." });
  if (await getMembership(db, input.leagueId, input.userId)) throw new TRPCError({ code: "CONFLICT", message: "You already have a registration in this league." });
  const result = await db.insert(leaguePlayers).values({ leagueId: input.leagueId, userId: input.userId, playerName: input.playerName, username: input.username, profilePicture: input.profilePicture || null, whatsappNumber: input.whatsappNumber || null, registrationStatus: "pending" });
  return { id: Number(result[0].insertId) };
}

export async function updateOwnProfile(input: { membershipId: number; playerName: string; username: string; profilePicture?: string; whatsappNumber?: string; userId: number }) {
  const db = await requireDb();
  const rows = await db.select().from(leaguePlayers).where(and(eq(leaguePlayers.id, input.membershipId), eq(leaguePlayers.userId, input.userId))).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Player profile not found." });
  const duplicate = await db.select({ id: leaguePlayers.id }).from(leaguePlayers).where(and(eq(leaguePlayers.leagueId, rows[0].leagueId), eq(leaguePlayers.username, input.username))).limit(1);
  if (duplicate[0] && duplicate[0].id !== input.membershipId) throw new TRPCError({ code: "CONFLICT", message: "That username is already in use in this league." });
  await db.update(leaguePlayers).set({ playerName: input.playerName, username: input.username, profilePicture: input.profilePicture || null, whatsappNumber: input.whatsappNumber || null }).where(eq(leaguePlayers.id, input.membershipId));
  return { success: true } as const;
}

export async function playerDashboard(userId: number) {
  const db = await requireDb();
  const memberships = await db.select({ membership: leaguePlayers, league: leagues, team: teams }).from(leaguePlayers).innerJoin(leagues, eq(leagues.id, leaguePlayers.leagueId)).leftJoin(teams, eq(teams.id, leaguePlayers.teamId)).where(eq(leaguePlayers.userId, userId)).orderBy(asc(leagues.name));
  const result = [];
  for (const row of memberships) {
    const [teamRows, fixtureRows] = await Promise.all([
      db.select().from(teams).where(eq(teams.leagueId, row.league.id)).orderBy(asc(teams.name)),
      db.select().from(fixtures).where(eq(fixtures.leagueId, row.league.id)).orderBy(asc(fixtures.round), asc(fixtures.id)),
    ]);
    const standings = calculateStandings(teamRows, fixtureRows);
    const teamStanding = row.team ? standings.find((standing) => standing.teamId === row.team!.id) : undefined;
    const teamFixtures = row.team ? fixtureRows.filter((fixture) => fixture.homeTeamId === row.team!.id || fixture.awayTeamId === row.team!.id) : [];
    const teamsById = new Map(teamRows.map((team) => [team.id, team]));
    result.push({
      membership: row.membership,
      league: row.league,
      team: row.team,
      standing: teamStanding ?? null,
      fixtures: teamFixtures.map((fixture) => ({ ...fixture, opponent: teamsById.get(fixture.homeTeamId === row.team?.id ? fixture.awayTeamId : fixture.homeTeamId) ?? null, isHome: fixture.homeTeamId === row.team?.id })),
    });
  }
  return result;
}

export async function listLeaguePlayers(leagueId: number, userId: number) {
  const db = await requireDb();
  await requireOwnedLeague(db, leagueId, userId);
  return db.select({ membership: leaguePlayers, user: users, team: teams }).from(leaguePlayers).innerJoin(users, eq(users.id, leaguePlayers.userId)).leftJoin(teams, eq(teams.id, leaguePlayers.teamId)).where(eq(leaguePlayers.leagueId, leagueId)).orderBy(asc(leaguePlayers.registrationStatus), asc(leaguePlayers.playerName));
}

export async function addPlayerByEmail(input: { leagueId: number; email: string; playerName: string; username: string; profilePicture?: string; whatsappNumber?: string; userId: number }) {
  const db = await requireDb();
  await requireOwnedLeague(db, input.leagueId, input.userId);
  const accountRows = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  const account = accountRows[0];
  if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "No account found for that email. Ask the player to create an account first." });
  if (await getMembership(db, input.leagueId, account.id)) throw new TRPCError({ code: "CONFLICT", message: "This account is already registered in the league." });
  const duplicateUsername = await db.select({ id: leaguePlayers.id }).from(leaguePlayers).where(and(eq(leaguePlayers.leagueId, input.leagueId), eq(leaguePlayers.username, input.username))).limit(1);
  if (duplicateUsername[0]) throw new TRPCError({ code: "CONFLICT", message: "That username is already in use in this league." });
  const result = await db.insert(leaguePlayers).values({ leagueId: input.leagueId, userId: account.id, playerName: input.playerName, username: input.username, profilePicture: input.profilePicture || null, whatsappNumber: input.whatsappNumber || null, registrationStatus: "pending" });
  return { id: Number(result[0].insertId) };
}

export async function reviewPlayer(input: { membershipId: number; registrationStatus: "approved" | "rejected"; teamId?: number | null; userId: number }) {
  const db = await requireDb();
  const rows = await db.select().from(leaguePlayers).where(eq(leaguePlayers.id, input.membershipId)).limit(1);
  const membership = rows[0];
  if (!membership) throw new TRPCError({ code: "NOT_FOUND", message: "Player registration not found." });
  await requireOwnedLeague(db, membership.leagueId, input.userId);
  if (input.teamId != null) {
    const teamRows = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, input.teamId), eq(teams.leagueId, membership.leagueId))).limit(1);
    if (!teamRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "That team does not belong to this league." });
  }
  await db.update(leaguePlayers).set({ registrationStatus: input.registrationStatus, teamId: input.registrationStatus === "approved" ? (input.teamId ?? membership.teamId) : null }).where(eq(leaguePlayers.id, input.membershipId));
  return { success: true } as const;
}

export async function removePlayer(membershipId: number, userId: number) {
  const db = await requireDb();
  const rows = await db.select({ leagueId: leaguePlayers.leagueId }).from(leaguePlayers).where(eq(leaguePlayers.id, membershipId)).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Player registration not found." });
  await requireOwnedLeague(db, rows[0].leagueId, userId);
  await db.delete(leaguePlayers).where(eq(leaguePlayers.id, membershipId));
  return { success: true } as const;
}

export async function teamPage(teamId: number, userId: number) {
  const db = await requireDb();
  const teamRows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  const team = teamRows[0];
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
  const leagueRows = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1);
  const league = leagueRows[0];
  if (!league) throw new TRPCError({ code: "NOT_FOUND", message: "League not found." });
  const isOwner = league.createdBy === userId;
  const member = await getMembership(db, league.id, userId);
  if (!isOwner && (!member || member.registrationStatus !== "approved")) throw new TRPCError({ code: "FORBIDDEN", message: "Join and get approved for this league to view its team pages." });
  const [teamRowsInLeague, fixtureRows, players] = await Promise.all([
    db.select().from(teams).where(eq(teams.leagueId, league.id)),
    db.select().from(fixtures).where(eq(fixtures.leagueId, league.id)),
    db.select({ membership: leaguePlayers, user: users }).from(leaguePlayers).innerJoin(users, eq(users.id, leaguePlayers.userId)).where(and(eq(leaguePlayers.leagueId, league.id), eq(leaguePlayers.teamId, teamId), eq(leaguePlayers.registrationStatus, "approved"))),
  ]);
  const standings = calculateStandings(teamRowsInLeague, fixtureRows);
  return { team, league, standing: standings.find((standing) => standing.teamId === teamId) ?? null, players };
}
