import { eq, or } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { allocateTestPlayerIds } from "./test-player-ids";
import type { TrpcContext } from "./_core/context";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const createdOpenIds: string[] = [];
function contextFor(user: NonNullable<TrpcContext["user"]>): TrpcContext { return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] }; }

describeWithDatabase("player-submitted fixture results", () => {
  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const openId of createdOpenIds) await db.delete(users).where(eq(users.openId, openId));
  });

  it("confirms a player result, isolates pending standings, and resolves disputes", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for this integration test.");
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const adminOpenId = `match-admin-${suffix}`;
    const homeOpenId = `match-home-${suffix}`;
    const awayOpenId = `match-away-${suffix}`;
    const outsiderOpenId = `match-outsider-${suffix}`;
    const [adminPlayerId, homePlayerId, awayPlayerId, outsiderPlayerId] = await allocateTestPlayerIds(db, 4);
    createdOpenIds.push(adminOpenId, homeOpenId, awayOpenId, outsiderOpenId);
    await db.insert(users).values([
      { openId: adminOpenId, playerId: adminPlayerId, name: "Match Admin", email: `${adminOpenId}@example.test`, loginMethod: "test" },
      { openId: homeOpenId, playerId: homePlayerId, name: "Arsenal Player", email: `${homeOpenId}@example.test`, loginMethod: "test" },
      { openId: awayOpenId, playerId: awayPlayerId, name: "Barcelona Player", email: `${awayOpenId}@example.test`, loginMethod: "test" },
      { openId: outsiderOpenId, playerId: outsiderPlayerId, name: "Unrelated Player", email: `${outsiderOpenId}@example.test`, loginMethod: "test" },
    ]);
    const rows = await db.select().from(users).where(or(eq(users.openId, adminOpenId), eq(users.openId, homeOpenId), eq(users.openId, awayOpenId), eq(users.openId, outsiderOpenId)));
    const admin = rows.find((row) => row.openId === adminOpenId);
    const homePlayer = rows.find((row) => row.openId === homeOpenId);
    const awayPlayer = rows.find((row) => row.openId === awayOpenId);
    const outsider = rows.find((row) => row.openId === outsiderOpenId);
    if (!admin || !homePlayer || !awayPlayer || !outsider) throw new Error("Test users were not created.");
    const adminCaller = appRouter.createCaller(contextFor(admin));
    const homeCaller = appRouter.createCaller(contextFor(homePlayer));
    const awayCaller = appRouter.createCaller(contextFor(awayPlayer));
    const outsiderCaller = appRouter.createCaller(contextFor(outsider));

    const { id: leagueId } = await adminCaller.league.create({ name: "Confirmation League", seasonName: "Result Season", numberOfTeams: 2 });
    await adminCaller.league.addTeam({ leagueId, name: "Arsenal", managerName: "Arsenal Player" });
    await adminCaller.league.addTeam({ leagueId, name: "Barcelona", managerName: "Barcelona Player" });
    const teams = (await adminCaller.league.dashboard({ leagueId })).teams;
    const arsenal = teams.find((team) => team.name === "Arsenal");
    const barcelona = teams.find((team) => team.name === "Barcelona");
    if (!arsenal || !barcelona) throw new Error("Test teams were not created.");
    const homeRegistration = await adminCaller.playerAdmin.add({ leagueId, playerId: homePlayer.playerId });
    const awayRegistration = await adminCaller.playerAdmin.add({ leagueId, playerId: awayPlayer.playerId });
    await adminCaller.playerAdmin.assignTeam({ membershipId: homeRegistration.id, teamId: arsenal.id });
    await adminCaller.playerAdmin.assignTeam({ membershipId: awayRegistration.id, teamId: barcelona.id });
    await adminCaller.playerAdmin.review({ membershipId: homeRegistration.id, registrationStatus: "approved", teamId: arsenal.id });
    await adminCaller.playerAdmin.review({ membershipId: awayRegistration.id, registrationStatus: "approved", teamId: barcelona.id });
    await adminCaller.league.generateFixtures({ leagueId });
    const initial = await adminCaller.league.dashboard({ leagueId });
    const firstFixture = initial.fixtures[0];
    const secondFixture = initial.fixtures[1];
    if (!firstFixture || !secondFixture) throw new Error("Expected home-and-away fixtures.");
    const secondHomeScore = secondFixture.homeTeamId === arsenal.id ? 2 : 0;
    const secondAwayScore = secondFixture.homeTeamId === arsenal.id ? 0 : 2;

    expect((await homeCaller.player.fixtures()).every((fixture) => fixture.isParticipant)).toBe(true);
    await expect(outsiderCaller.player.submitResult({ fixtureId: firstFixture.id, homeScore: 3, awayScore: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await homeCaller.player.submitResult({ fixtureId: firstFixture.id, homeScore: 3, awayScore: 1 });
    expect((await adminCaller.league.dashboard({ leagueId })).standings.every((row) => row.played === 0)).toBe(true);
    const pendingForAway = (await awayCaller.player.fixtures()).find((fixture) => fixture.id === firstFixture.id);
    expect(pendingForAway).toMatchObject({ status: "result_submitted", canConfirm: true, result: { homeScore: 3, awayScore: 1, status: "submitted" } });
    await expect(homeCaller.player.confirmResult({ fixtureId: firstFixture.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await awayCaller.player.confirmResult({ fixtureId: firstFixture.id });
    const confirmed = await adminCaller.league.dashboard({ leagueId });
    expect(confirmed.fixtures.find((fixture) => fixture.id === firstFixture.id)?.status).toBe("confirmed");
    expect(confirmed.standings.find((row) => row.teamId === arsenal.id)).toMatchObject({ played: 1, wins: 1, goalsFor: 3, goalsAgainst: 1, points: 3 });

    await homeCaller.player.submitResult({ fixtureId: secondFixture.id, homeScore: secondHomeScore, awayScore: secondAwayScore });
    await awayCaller.player.disputeResult({ fixtureId: secondFixture.id });
    const disputed = await adminCaller.league.dashboard({ leagueId });
    expect(disputed.fixtures.find((fixture) => fixture.id === secondFixture.id)?.status).toBe("disputed");
    expect(disputed.standings.find((row) => row.teamId === arsenal.id)?.played).toBe(1);
    const management = await adminCaller.matchAdmin.list({ leagueId });
    expect(management.find((fixture) => fixture.id === secondFixture.id)).toMatchObject({ status: "disputed", result: { status: "disputed" } });
    await adminCaller.matchAdmin.resolve({ fixtureId: secondFixture.id, action: "cancel" });
    await homeCaller.player.submitResult({ fixtureId: secondFixture.id, homeScore: secondHomeScore, awayScore: secondAwayScore });
    await awayCaller.player.disputeResult({ fixtureId: secondFixture.id });
    await adminCaller.matchAdmin.resolve({ fixtureId: secondFixture.id, action: "correct", homeScore: secondHomeScore, awayScore: secondAwayScore });
    const resolved = await adminCaller.league.dashboard({ leagueId });
    expect(resolved.fixtures.find((fixture) => fixture.id === secondFixture.id)).toMatchObject({ status: "confirmed", homeScore: secondHomeScore, awayScore: secondAwayScore });
    expect(resolved.standings.find((row) => row.teamId === arsenal.id)).toMatchObject({ played: 2, wins: 2, goalsFor: 5, goalsAgainst: 1, points: 6 });
    await expect(homeCaller.player.submitResult({ fixtureId: firstFixture.id, homeScore: 9, awayScore: 0 })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
