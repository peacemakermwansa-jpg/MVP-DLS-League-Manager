import { eq, or } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const createdOpenIds: string[] = [];
function contextFor(user: NonNullable<TrpcContext["user"]>): TrpcContext { return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] }; }

describeWithDatabase("player registration and permissions", () => {
  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const openId of createdOpenIds) await db.delete(users).where(eq(users.openId, openId));
  });

  it("lets an owner approve and assign a player while blocking player admin access", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for this integration test.");
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const adminOpenId = `player-admin-${suffix}`;
    const playerOpenId = `player-user-${suffix}`;
    const joinerOpenId = `player-joiner-${suffix}`;
    createdOpenIds.push(adminOpenId, playerOpenId, joinerOpenId);
    await db.insert(users).values([
      { openId: adminOpenId, name: "Player Admin", email: `${adminOpenId}@example.test`, loginMethod: "test" },
      { openId: playerOpenId, name: "Player User", email: `${playerOpenId}@example.test`, loginMethod: "test" },
      { openId: joinerOpenId, name: "League Joiner", email: `${joinerOpenId}@example.test`, loginMethod: "test" },
    ]);
    const rows = await db.select().from(users).where(or(eq(users.openId, adminOpenId), eq(users.openId, playerOpenId), eq(users.openId, joinerOpenId)));
    const admin = rows.find((row) => row.openId === adminOpenId);
    const player = rows.find((row) => row.openId === playerOpenId);
    const joiner = rows.find((row) => row.openId === joinerOpenId);
    if (!admin || !player || !joiner) throw new Error("Test users were not created.");
    const adminCaller = appRouter.createCaller(contextFor(admin));
    const playerCaller = appRouter.createCaller(contextFor(player));
    const joinerCaller = appRouter.createCaller(contextFor(joiner));
    const { id: leagueId } = await adminCaller.league.create({ name: "Player Test League", seasonName: "Player Season", numberOfTeams: 2 });
    const secondLeague = await adminCaller.league.create({ name: "Second Test League", seasonName: "Player Season", numberOfTeams: 2 });
    expect(Number.isInteger(leagueId)).toBe(true);
    expect(leagueId).toBeGreaterThan(0);
    expect(secondLeague.id).not.toBe(leagueId);
    await adminCaller.league.addTeam({ leagueId, name: "Alpha", managerName: "Coach Alpha" });
    await adminCaller.league.addTeam({ leagueId, name: "Bravo", managerName: "Coach Bravo" });
    const leagueDashboard = await adminCaller.league.dashboard({ leagueId });
    const alpha = leagueDashboard.teams.find((team) => team.name === "Alpha");
    if (!alpha) throw new Error("Expected Alpha team.");
    const registration = await adminCaller.playerAdmin.add({ leagueId, email: player.email!, playerName: "Player One", username: `player_one_${suffix}` });
    expect((await adminCaller.playerAdmin.list({ leagueId }))[0]?.membership.registrationStatus).toBe("pending");
    await adminCaller.playerAdmin.review({ membershipId: registration.id, registrationStatus: "approved", teamId: alpha.id });
    await adminCaller.league.generateFixtures({ leagueId });
    const playerView = await playerCaller.player.dashboard();
    const foundLeague = await playerCaller.player.findLeague({ leagueId });
    expect(foundLeague).toMatchObject({ id: leagueId, name: "Player Test League" });
    await expect(playerCaller.player.findLeague({ leagueId: 999999999 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "No league was found with ID 999999999. Check the number and try again." });
    const joinRegistration = await joinerCaller.player.register({ leagueId, playerName: "League Joiner", username: `league_joiner_${suffix}` });
    expect(joinRegistration.id).toBeGreaterThan(0);
    expect((await adminCaller.playerAdmin.list({ leagueId })).some(({ membership }) => membership.id === joinRegistration.id)).toBe(true);
    expect(playerView[0]).toMatchObject({ league: { id: leagueId }, team: { id: alpha.id }, membership: { registrationStatus: "approved" } });
    expect(playerView[0]?.standing).toMatchObject({ teamName: "Alpha", played: 0, points: 0 });
    expect(playerView[0]?.fixtures).toHaveLength(2);
    await expect(playerCaller.playerAdmin.list({ leagueId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(playerCaller.league.generateFixtures({ leagueId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(playerCaller.league.update({ leagueId, name: "Hijacked", seasonName: "Nope", numberOfTeams: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const teamView = await playerCaller.player.team({ teamId: alpha.id });
    expect(teamView.players[0]?.membership.username).toBe(`player_one_${suffix}`);
  });
});
