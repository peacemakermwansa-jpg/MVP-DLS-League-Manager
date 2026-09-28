import { and, asc, eq, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { fixtureResults, fixtures, leaguePlayers, leagues, teams, users } from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";

const ACTIVE_RESULT_STATUSES = ["submitted", "disputed"] as const;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type PlayerSummary = { userId: number; playerId: number; name: string; username: string; teamId: number };

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
  return db;
}

async function getFixture(db: Db, fixtureId: number) {
  const rows = await db.select({ fixture: fixtures, league: leagues, homeTeam: teams }).from(fixtures).innerJoin(leagues, eq(leagues.id, fixtures.leagueId)).innerJoin(teams, eq(teams.id, fixtures.homeTeamId)).where(eq(fixtures.id, fixtureId)).limit(1);
  const row = rows[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Fixture not found." });
  const awayRows = await db.select().from(teams).where(eq(teams.id, row.fixture.awayTeamId)).limit(1);
  if (!awayRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Fixture teams could not be found." });
  return { ...row, awayTeam: awayRows[0] };
}

async function participantsForFixture(db: Db, fixture: { leagueId: number; homeTeamId: number; awayTeamId: number }) {
  const rows = await db.select({ membership: leaguePlayers, user: users }).from(leaguePlayers).innerJoin(users, eq(users.id, leaguePlayers.userId)).where(and(eq(leaguePlayers.leagueId, fixture.leagueId), inArray(leaguePlayers.teamId, [fixture.homeTeamId, fixture.awayTeamId]), eq(leaguePlayers.registrationStatus, "approved")));
  const map = new Map<number, PlayerSummary>();
  for (const row of rows) {
    if (row.membership.teamId && !map.has(row.membership.teamId)) map.set(row.membership.teamId, { userId: row.user.id, playerId: row.user.playerId, name: row.membership.playerName, username: row.membership.username, teamId: row.membership.teamId });
  }
  return { homePlayer: map.get(fixture.homeTeamId) ?? null, awayPlayer: map.get(fixture.awayTeamId) ?? null };
}

function publicResult(result: typeof fixtureResults.$inferSelect | null) {
  if (!result) return null;
  return { id: result.id, submittedBy: result.submittedBy, homeScore: result.homeScore, awayScore: result.awayScore, proofUrl: result.proofUrl, status: result.status, confirmedBy: result.confirmedBy, disputedAt: result.disputedAt, resolvedAt: result.resolvedAt };
}

async function decorateFixture(db: Db, fixtureId: number, userId?: number) {
  const row = await getFixture(db, fixtureId);
  const participants = await participantsForFixture(db, row.fixture);
  const resultRows = await db.select().from(fixtureResults).where(eq(fixtureResults.fixtureId, fixtureId)).limit(1);
  const result = resultRows[0] ?? null;
  const isParticipant = participants.homePlayer?.userId === userId || participants.awayPlayer?.userId === userId;
  return { ...row.fixture, league: row.league, homeTeam: row.homeTeam, awayTeam: row.awayTeam, homePlayer: participants.homePlayer, awayPlayer: participants.awayPlayer, result: publicResult(result), isParticipant, canSubmit: isParticipant && row.fixture.status === "scheduled" && !result, canConfirm: isParticipant && !!result && result.submittedBy !== userId && result.status === "submitted" && row.fixture.status === "result_submitted" };
}

async function requireParticipant(db: Db, fixtureId: number, userId: number) {
  const row = await getFixture(db, fixtureId);
  const participants = await participantsForFixture(db, row.fixture);
  const isHome = participants.homePlayer?.userId === userId;
  const isAway = participants.awayPlayer?.userId === userId;
  if (!isHome && !isAway) throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage fixtures involving your approved team." });
  return { ...row, participants, isHome, isAway };
}

function decodeProof(proofData?: string) {
  if (!proofData) return null;
  const match = proofData.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Proof must be a PNG, JPEG, or WebP image." });
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > 5 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Proof image must be 5 MB or smaller." });
  return { buffer, contentType: match[1] };
}

export async function playerFixtures(userId: number) {
  const db = await requireDb();
  const memberships = await db.select({ leagueId: leaguePlayers.leagueId, teamId: leaguePlayers.teamId }).from(leaguePlayers).where(and(eq(leaguePlayers.userId, userId), eq(leaguePlayers.registrationStatus, "approved")));
  const result = [];
  for (const membership of memberships) {
    if (!membership.teamId) continue;
    const fixtureRows = await db.select({ id: fixtures.id }).from(fixtures).where(and(eq(fixtures.leagueId, membership.leagueId), or(eq(fixtures.homeTeamId, membership.teamId), eq(fixtures.awayTeamId, membership.teamId)))).orderBy(asc(fixtures.round), asc(fixtures.id));
    for (const fixture of fixtureRows) result.push(await decorateFixture(db, fixture.id, userId));
  }
  return result;
}

export async function ownerMatchManagement(leagueId: number, userId: number) {
  const db = await requireDb();
  const ownerRows = await db.select({ id: leagues.id }).from(leagues).where(and(eq(leagues.id, leagueId), eq(leagues.createdBy, userId))).limit(1);
  if (!ownerRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "League not found." });
  const fixtureRows = await db.select({ id: fixtures.id }).from(fixtures).where(eq(fixtures.leagueId, leagueId)).orderBy(asc(fixtures.round), asc(fixtures.id));
  return Promise.all(fixtureRows.map((fixture) => decorateFixture(db, fixture.id, userId)));
}

export async function submitPlayerResult(input: { fixtureId: number; homeScore: number; awayScore: number; proofData?: string; userId: number }) {
  const db = await requireDb();
  const { fixture, isHome, isAway } = await requireParticipant(db, input.fixtureId, input.userId);
  if (fixture.status !== "scheduled") throw new TRPCError({ code: "CONFLICT", message: "This fixture is not accepting a new result." });
  if (!isHome && !isAway) throw new TRPCError({ code: "FORBIDDEN", message: "You are not a participant in this fixture." });
  const existingRows = await db.select({ id: fixtureResults.id, status: fixtureResults.status }).from(fixtureResults).where(eq(fixtureResults.fixtureId, input.fixtureId)).limit(1);
  const existing = existingRows[0];
  if (existing && ACTIVE_RESULT_STATUSES.includes(existing.status as (typeof ACTIVE_RESULT_STATUSES)[number])) throw new TRPCError({ code: "CONFLICT", message: "This fixture already has an active result submission." });
  const proof = decodeProof(input.proofData);
  let proofKey: string | null = null;
  let proofUrl: string | null = null;
  if (proof) {
    const stored = await storagePut(`fixture-proofs/${input.fixtureId}`, proof.buffer, proof.contentType);
    proofKey = stored.key;
    proofUrl = stored.url;
  }
  try {
    await db.transaction(async (tx) => {
      if (existing?.status === "cancelled") {
        await tx.update(fixtureResults).set({ submittedBy: input.userId, homeScore: input.homeScore, awayScore: input.awayScore, proofKey, proofUrl, status: "submitted", confirmedBy: null, disputedAt: null, resolvedAt: null, resolvedBy: null }).where(and(eq(fixtureResults.id, existing.id), eq(fixtureResults.status, "cancelled")));
      } else {
        await tx.insert(fixtureResults).values({ fixtureId: input.fixtureId, submittedBy: input.userId, homeScore: input.homeScore, awayScore: input.awayScore, proofKey, proofUrl, status: "submitted" });
      }
      const updated = await tx.update(fixtures).set({ status: "result_submitted", homeScore: input.homeScore, awayScore: input.awayScore }).where(and(eq(fixtures.id, input.fixtureId), eq(fixtures.status, "scheduled")));
      if (updated[0].affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "This fixture already has an active result submission." });
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "CONFLICT", message: "This fixture already has an active result submission." });
  }
  return { success: true } as const;
}

async function decidePlayerResult(input: { fixtureId: number; userId: number; decision: "confirmed" | "disputed" }) {
  const db = await requireDb();
  const { fixture, participants } = await requireParticipant(db, input.fixtureId, input.userId);
  const resultRows = await db.select().from(fixtureResults).where(eq(fixtureResults.fixtureId, input.fixtureId)).limit(1);
  const result = resultRows[0];
  if (fixture.status !== "result_submitted" || !result || result.status !== "submitted") throw new TRPCError({ code: "CONFLICT", message: "There is no pending result to decide." });
  if (result.submittedBy === input.userId) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot confirm or dispute your own submitted result." });
  if (participants.homePlayer?.userId !== input.userId && participants.awayPlayer?.userId !== input.userId) throw new TRPCError({ code: "FORBIDDEN", message: "Only the opposing player can decide this result." });
  await db.transaction(async (tx) => {
    await tx.update(fixtureResults).set({ status: input.decision, confirmedBy: input.decision === "confirmed" ? input.userId : null, disputedAt: input.decision === "disputed" ? new Date() : null }).where(and(eq(fixtureResults.id, result.id), eq(fixtureResults.status, "submitted")));
    await tx.update(fixtures).set({ status: input.decision === "confirmed" ? "confirmed" : "disputed", playedAt: input.decision === "confirmed" ? new Date() : null }).where(and(eq(fixtures.id, input.fixtureId), eq(fixtures.status, "result_submitted")));
  });
  return { success: true } as const;
}

export function confirmPlayerResult(fixtureId: number, userId: number) { return decidePlayerResult({ fixtureId, userId, decision: "confirmed" }); }
export function disputePlayerResult(fixtureId: number, userId: number) { return decidePlayerResult({ fixtureId, userId, decision: "disputed" }); }

export async function resolveAdminResult(input: { fixtureId: number; action: "approve" | "correct" | "cancel"; homeScore?: number; awayScore?: number; userId: number }) {
  const db = await requireDb();
  const row = await getFixture(db, input.fixtureId);
  if (row.league.createdBy !== input.userId) throw new TRPCError({ code: "NOT_FOUND", message: "Fixture not found." });
  const resultRows = await db.select().from(fixtureResults).where(eq(fixtureResults.fixtureId, input.fixtureId)).limit(1);
  const result = resultRows[0];
  if (!result || !["submitted", "disputed"].includes(result.status)) throw new TRPCError({ code: "CONFLICT", message: "There is no active submission to resolve." });
  if (input.action === "cancel") {
    await db.transaction(async (tx) => {
      await tx.update(fixtureResults).set({ status: "cancelled", resolvedBy: input.userId, resolvedAt: new Date() }).where(eq(fixtureResults.id, result.id));
      await tx.update(fixtures).set({ status: "scheduled", homeScore: null, awayScore: null, playedAt: null }).where(eq(fixtures.id, input.fixtureId));
    });
    return { success: true } as const;
  }
  const homeScore = input.action === "correct" ? input.homeScore : result.homeScore;
  const awayScore = input.action === "correct" ? input.awayScore : result.awayScore;
  if (homeScore == null || awayScore == null) throw new TRPCError({ code: "BAD_REQUEST", message: "Both corrected scores are required." });
  await db.transaction(async (tx) => {
    await tx.update(fixtureResults).set({ status: "confirmed", homeScore, awayScore, confirmedBy: input.userId, resolvedBy: input.userId, resolvedAt: new Date() }).where(eq(fixtureResults.id, result.id));
    await tx.update(fixtures).set({ status: "confirmed", homeScore, awayScore, playedAt: new Date() }).where(eq(fixtures.id, input.fixtureId));
  });
  return { success: true } as const;
}
