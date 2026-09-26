import { eq, or } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { leagues, users, type User } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const createdOpenIds: string[] = [];

function contextFor(user: User): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describeWithDatabase("league ownership flow", () => {
  afterAll(async () => {
    const db = await getDb();
    if (!db || !createdOpenIds.length) return;
    for (const openId of createdOpenIds) {
      await db.delete(users).where(eq(users.openId, openId));
    }
  });

  it("keeps one user's league invisible and immutable to another user", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for this integration test.");

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const accountAOpenId = `ownership-a-${suffix}`;
    const accountBOpenId = `ownership-b-${suffix}`;
    const basePlayerId = 100000 + (Date.now() % 700000);
    createdOpenIds.push(accountAOpenId, accountBOpenId);
    await db.insert(users).values([
      { openId: accountAOpenId, playerId: basePlayerId, name: "Account A", email: `${accountAOpenId}@example.test`, loginMethod: "test" },
      { openId: accountBOpenId, playerId: basePlayerId + 1, name: "Account B", email: `${accountBOpenId}@example.test`, loginMethod: "test" },
    ]);
    const accountRows = await db.select().from(users).where(orUserIds(accountAOpenId, accountBOpenId));
    const accountA = accountRows.find((user) => user.openId === accountAOpenId);
    const accountB = accountRows.find((user) => user.openId === accountBOpenId);
    if (!accountA || !accountB) throw new Error("Test accounts were not created.");

    const callerA = appRouter.createCaller(contextFor(accountA));
    const callerB = appRouter.createCaller(contextFor(accountB));
    const { id: leagueId } = await callerA.league.create({ name: "Ownership Test League", seasonName: "Integration Season", numberOfTeams: 2 });
    await callerA.league.addTeam({ leagueId, name: "Alpha", managerName: "Manager A" });
    await callerA.league.addTeam({ leagueId, name: "Bravo", managerName: "Manager B" });
    const { fixtureCount } = await callerA.league.generateFixtures({ leagueId });
    expect(fixtureCount).toBe(2);
    const dashboardBeforeResult = await callerA.league.dashboard({ leagueId });
    const pendingFixture = dashboardBeforeResult.fixtures.find((fixture) => fixture.status === "pending");
    if (!pendingFixture) throw new Error("Expected a pending fixture.");
    await callerA.league.recordResult({ fixtureId: pendingFixture.id, homeScore: 3, awayScore: 1 });
    await expect(callerA.league.recordResult({ fixtureId: pendingFixture.id, homeScore: 0, awayScore: 9 })).rejects.toMatchObject({ code: "CONFLICT" });
    const dashboardAfterResult = await callerA.league.dashboard({ leagueId });
    expect(dashboardAfterResult.standings[0]).toMatchObject({ teamName: "Alpha", points: 3, goalsFor: 3, goalsAgainst: 1, goalDifference: 2 });

    expect((await callerB.league.overview())).toEqual([]);
    await expect(callerB.league.dashboard({ leagueId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerB.league.update({ leagueId, name: "Hijacked", seasonName: "Nope", numberOfTeams: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerB.league.addTeam({ leagueId, name: "Intruder", managerName: "Intruder" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

function orUserIds(firstOpenId: string, secondOpenId: string) {
  return or(eq(users.openId, firstOpenId), eq(users.openId, secondOpenId));
}
