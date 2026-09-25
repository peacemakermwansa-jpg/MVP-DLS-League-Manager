import { and, asc, desc, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { fixtures, leagues, teams, type Fixture, type Team } from "../drizzle/schema";
import { getDb } from "./db";

export type ScheduledFixture = Fixture & { homeTeam: Team; awayTeam: Team };
export type StandingsRow = {
  teamId: number;
  teamName: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export function generateRoundRobinFixtures(teamIds: number[]) {
  if (teamIds.length < 2) return [];
  const rotation = [...teamIds];
  if (rotation.length % 2 !== 0) rotation.push(null as unknown as number);
  const rounds = rotation.length - 1;
  const matchesPerRound = rotation.length / 2;
  const schedule: Array<{ round: number; homeTeamId: number; awayTeamId: number }> = [];

  for (let round = 0; round < rounds; round += 1) {
    for (let match = 0; match < matchesPerRound; match += 1) {
      const left = rotation[match];
      const right = rotation[rotation.length - 1 - match];
      if (left == null || right == null) continue;
      const shouldSwap = round % 2 === 1;
      schedule.push({
        round: round + 1,
        homeTeamId: shouldSwap ? right : left,
        awayTeamId: shouldSwap ? left : right,
      });
    }
    const fixed = rotation[0];
    const tail = rotation.slice(1);
    tail.unshift(tail.pop() as number);
    rotation.splice(0, rotation.length, fixed, ...tail);
  }

  const firstLeg = schedule.map((fixture) => ({ ...fixture }));
  const secondLeg = schedule.map((fixture) => ({
    round: fixture.round + rounds,
    homeTeamId: fixture.awayTeamId,
    awayTeamId: fixture.homeTeamId,
  }));
  return [...firstLeg, ...secondLeg];
}

export function calculateStandings(teamRows: Team[], fixtureRows: Fixture[]): StandingsRow[] {
  const table = new Map<number, StandingsRow>();
  for (const team of teamRows) {
    table.set(team.id, {
      teamId: team.id, teamName: team.name, logoUrl: team.logoUrl,
      played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
      goalDifference: 0, points: 0,
    });
  }

  for (const fixture of fixtureRows) {
    if (fixture.status !== "completed" || fixture.homeScore == null || fixture.awayScore == null) continue;
    const home = table.get(fixture.homeTeamId);
    const away = table.get(fixture.awayTeamId);
    if (!home || !away) continue;
    home.played += 1; away.played += 1;
    home.goalsFor += fixture.homeScore; home.goalsAgainst += fixture.awayScore;
    away.goalsFor += fixture.awayScore; away.goalsAgainst += fixture.homeScore;
    if (fixture.homeScore > fixture.awayScore) {
      home.wins += 1; away.losses += 1; home.points += 3;
    } else if (fixture.homeScore < fixture.awayScore) {
      away.wins += 1; home.losses += 1; away.points += 3;
    } else {
      home.draws += 1; away.draws += 1; home.points += 1; away.points += 1;
    }
  }

  return Array.from(table.values())
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName));
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
  return db;
}

async function requireOwnedLeague(db: Awaited<ReturnType<typeof requireDb>>, leagueId: number, userId: number) {
  const rows = await db.select().from(leagues).where(and(eq(leagues.id, leagueId), eq(leagues.createdBy, userId))).limit(1);
  const league = rows[0];
  if (!league) throw new TRPCError({ code: "NOT_FOUND", message: "League not found." });
  return league;
}

export async function listLeagues(userId: number) {
  const db = await requireDb();
  const [leagueRows, teamRows, fixtureRows] = await Promise.all([
    db.select().from(leagues).where(eq(leagues.createdBy, userId)).orderBy(desc(leagues.createdAt)),
    db.select().from(teams),
    db.select().from(fixtures),
  ]);
  return leagueRows.map((league) => ({
    ...league,
    teamCount: teamRows.filter((team) => team.leagueId === league.id).length,
    fixtureCount: fixtureRows.filter((fixture) => fixture.leagueId === league.id).length,
    completedFixtureCount: fixtureRows.filter((fixture) => fixture.leagueId === league.id && fixture.status === "completed").length,
  }));
}

export async function getLeagueDashboard(leagueId: number, userId: number) {
  const db = await requireDb();
  const league = await requireOwnedLeague(db, leagueId, userId);
  const [teamRows, fixtureRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.leagueId, leagueId)).orderBy(asc(teams.name)),
    db.select().from(fixtures).where(eq(fixtures.leagueId, leagueId)).orderBy(asc(fixtures.round), asc(fixtures.id)),
  ]);
  const teamsById = new Map(teamRows.map((team) => [team.id, team]));
  const detailedFixtures: ScheduledFixture[] = fixtureRows.flatMap((fixture) => {
    const homeTeam = teamsById.get(fixture.homeTeamId);
    const awayTeam = teamsById.get(fixture.awayTeamId);
    return homeTeam && awayTeam ? [{ ...fixture, homeTeam, awayTeam }] : [];
  });
  return { league, teams: teamRows, fixtures: detailedFixtures, standings: calculateStandings(teamRows, fixtureRows) };
}

export async function createLeague(input: { name: string; seasonName: string; numberOfTeams: number; userId: number }) {
  const db = await requireDb();
  const result = await db.insert(leagues).values({ name: input.name, seasonName: input.seasonName, numberOfTeams: input.numberOfTeams, createdBy: input.userId });
  return { id: Number(result[0].insertId) };
}

export async function updateLeague(input: { leagueId: number; name: string; seasonName: string; numberOfTeams: number; userId: number }) {
  const db = await requireDb();
  const league = await requireOwnedLeague(db, input.leagueId, input.userId);
  const teamCount = await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, league.id));
  if (input.numberOfTeams < teamCount.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `The team limit cannot be lower than the ${teamCount.length} registered teams.` });
  await db.update(leagues).set({ name: input.name, seasonName: input.seasonName, numberOfTeams: input.numberOfTeams }).where(eq(leagues.id, input.leagueId));
  return { success: true } as const;
}

export async function deleteLeague(leagueId: number, userId: number) {
  const db = await requireDb();
  await requireOwnedLeague(db, leagueId, userId);
  await db.delete(leagues).where(and(eq(leagues.id, leagueId), eq(leagues.createdBy, userId)));
  return { success: true } as const;
}

export async function addTeam(input: { leagueId: number; name: string; managerName: string; logoUrl?: string; userId: number }) {
  const db = await requireDb();
  const league = await requireOwnedLeague(db, input.leagueId, input.userId);
  const existing = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.leagueId, league.id), eq(teams.name, input.name))).limit(1);
  if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "A team with this name is already registered in the league." });
  const currentTeamCount = await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, league.id));
  if (currentTeamCount.length >= league.numberOfTeams) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This league has reached its team limit." });
  const result = await db.insert(teams).values({ leagueId: league.id, name: input.name, managerName: input.managerName, logoUrl: input.logoUrl || null });
  return { id: Number(result[0].insertId) };
}

async function ownedTeam(db: Awaited<ReturnType<typeof requireDb>>, teamId: number, userId: number) {
  const rows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  const team = rows[0];
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
  await requireOwnedLeague(db, team.leagueId, userId);
  return team;
}

export async function updateTeam(input: { teamId: number; name: string; managerName: string; logoUrl?: string; userId: number }) {
  const db = await requireDb();
  const team = await ownedTeam(db, input.teamId, input.userId);
  const duplicate = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.leagueId, team.leagueId), eq(teams.name, input.name))).limit(1);
  if (duplicate[0] && duplicate[0].id !== input.teamId) throw new TRPCError({ code: "CONFLICT", message: "A team with this name is already registered in the league." });
  await db.update(teams).set({ name: input.name, managerName: input.managerName, logoUrl: input.logoUrl || null }).where(eq(teams.id, input.teamId));
  return { success: true } as const;
}

export async function removeTeam(teamId: number, userId: number) {
  const db = await requireDb();
  await ownedTeam(db, teamId, userId);
  const fixtureRows = await db.select({ id: fixtures.id }).from(fixtures).where(or(eq(fixtures.homeTeamId, teamId), eq(fixtures.awayTeamId, teamId))).limit(1);
  if (fixtureRows[0]) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This team is already in the fixture schedule. Remove the schedule before deleting it." });
  await db.delete(teams).where(eq(teams.id, teamId));
  return { success: true } as const;
}

export async function generateFixtures(leagueId: number, userId: number) {
  const db = await requireDb();
  await requireOwnedLeague(db, leagueId, userId);
  const [teamRows, existingFixtures] = await Promise.all([
    db.select().from(teams).where(eq(teams.leagueId, leagueId)).orderBy(asc(teams.name)),
    db.select({ id: fixtures.id }).from(fixtures).where(eq(fixtures.leagueId, leagueId)).limit(1),
  ]);
  if (teamRows.length < 2) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Register at least two teams before generating fixtures." });
  if (existingFixtures[0]) throw new TRPCError({ code: "CONFLICT", message: "Fixtures have already been generated for this league." });
  const schedule = generateRoundRobinFixtures(teamRows.map((team) => team.id));
  if (schedule.length) await db.insert(fixtures).values(schedule.map((fixture) => ({ ...fixture, leagueId })));
  return { fixtureCount: schedule.length };
}

export async function recordResult(input: { fixtureId: number; homeScore: number; awayScore: number; userId: number }) {
  const db = await requireDb();
  const fixtureRows = await db.select().from(fixtures).where(eq(fixtures.id, input.fixtureId)).limit(1);
  const fixture = fixtureRows[0];
  if (!fixture) throw new TRPCError({ code: "NOT_FOUND", message: "Fixture not found." });
  await requireOwnedLeague(db, fixture.leagueId, input.userId);
  if (fixture.status === "completed") throw new TRPCError({ code: "CONFLICT", message: "This fixture already has a recorded result." });
  const updateResult = await db.update(fixtures).set({ homeScore: input.homeScore, awayScore: input.awayScore, status: "completed", playedAt: new Date() }).where(and(eq(fixtures.id, input.fixtureId), eq(fixtures.status, "pending")));
  if (updateResult[0].affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "This fixture already has a recorded result." });
  return { success: true } as const;
}
