import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { fixtures, leaguePlayers, notifications, users } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { allocateTestPlayerIds } from "./test-player-ids";
import type { TrpcContext } from "./_core/context";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const createdOpenIds: string[] = [];

function contextFor(user: NonNullable<TrpcContext["user"]>): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describeWithDatabase("in-app notifications", () => {
  afterAll(async () => {
    const db = await getDb();
    if (!db || !createdOpenIds.length) return;
    const rows = await db.select({ id: users.id }).from(users).where(inArray(users.openId, createdOpenIds));
    if (rows.length) await db.delete(notifications).where(inArray(notifications.userId, rows.map((row) => row.id)));
    await db.delete(users).where(inArray(users.openId, createdOpenIds));
  });

  it("notifies the right users for join, approval, and disputed-result events", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for this integration test.");
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const openIds = [`notifications-admin-${suffix}`, `notifications-joiner-${suffix}`, `notifications-home-${suffix}`, `notifications-away-${suffix}`];
    createdOpenIds.push(...openIds);
    const [adminPlayerId, joinerPlayerId, homePlayerId, awayPlayerId] = await allocateTestPlayerIds(db, 4);
    await db.insert(users).values([
      { openId: openIds[0], playerId: adminPlayerId, name: "Notification Admin", email: `${openIds[0]}@example.test`, loginMethod: "test", role: "admin", accountTypeSelected: true },
      { openId: openIds[1], playerId: joinerPlayerId, name: "Joining Player", email: `${openIds[1]}@example.test`, loginMethod: "test", role: "participant", accountTypeSelected: true },
      { openId: openIds[2], playerId: homePlayerId, name: "Home Player", email: `${openIds[2]}@example.test`, loginMethod: "test", role: "participant", accountTypeSelected: true },
      { openId: openIds[3], playerId: awayPlayerId, name: "Away Player", email: `${openIds[3]}@example.test`, loginMethod: "test", role: "participant", accountTypeSelected: true },
    ]);
    const rows = await db.select().from(users).where(inArray(users.openId, openIds));
    const admin = rows.find((row) => row.openId === openIds[0]);
    const joiner = rows.find((row) => row.openId === openIds[1]);
    const home = rows.find((row) => row.openId === openIds[2]);
    const away = rows.find((row) => row.openId === openIds[3]);
    if (!admin || !joiner || !home || !away) throw new Error("Notification test accounts were not created.");
    const adminCaller = appRouter.createCaller(contextFor(admin));
    const joinerCaller = appRouter.createCaller(contextFor(joiner));
    const homeCaller = appRouter.createCaller(contextFor(home));
    const awayCaller = appRouter.createCaller(contextFor(away));

    const league = await adminCaller.league.create({ name: "Notification League", seasonName: "Notification Season", numberOfTeams: 2 });
    await joinerCaller.player.register({ leagueId: league.id, playerName: "Joining Player", username: `joining_${joiner.playerId}` });
    const pending = await db.select().from(leaguePlayers).where(and(eq(leaguePlayers.leagueId, league.id), eq(leaguePlayers.userId, joiner.id))).limit(1);
    if (!pending[0]) throw new Error("Join request was not created.");

    const adminAfterJoin = await adminCaller.notifications.list();
    expect(adminAfterJoin.items.some((item) => item.type === "join_request" && item.userId === admin.id)).toBe(true);
    expect(adminAfterJoin.unreadCount).toBeGreaterThan(0);

    await adminCaller.playerAdmin.review({ membershipId: pending[0].id, registrationStatus: "approved" });
    const joinerAfterApproval = await joinerCaller.notifications.list();
    expect(joinerAfterApproval.items.some((item) => item.type === "approval" && item.title === "Registration approved")).toBe(true);

    const homeTeam = await adminCaller.league.addTeam({ leagueId: league.id, name: "Home XI", managerName: "Home Player" });
    const awayTeam = await adminCaller.league.addTeam({ leagueId: league.id, name: "Away XI", managerName: "Away Player" });
    await db.insert(leaguePlayers).values([
      { leagueId: league.id, userId: home.id, teamId: homeTeam.id, playerName: "Home Player", username: `home_${home.playerId}`, registrationStatus: "approved" },
      { leagueId: league.id, userId: away.id, teamId: awayTeam.id, playerName: "Away Player", username: `away_${away.playerId}`, registrationStatus: "approved" },
    ]);
    await adminCaller.league.generateFixtures({ leagueId: league.id });
    const fixture = (await db.select().from(fixtures).where(eq(fixtures.leagueId, league.id)).limit(1))[0];
    if (!fixture) throw new Error("Fixture was not generated.");
    const homeIsHost = fixture.homeTeamId === homeTeam.id;
    await homeCaller.player.submitResult({ fixtureId: fixture.id, homeScore: homeIsHost ? 2 : 1, awayScore: homeIsHost ? 1 : 2 });
    await awayCaller.player.disputeResult({ fixtureId: fixture.id });

    const adminAfterDispute = await adminCaller.notifications.list();
    const homeAfterDispute = await homeCaller.notifications.list();
    expect(adminAfterDispute.items.some((item) => item.type === "dispute" && item.href === "/match-management")).toBe(true);
    expect(homeAfterDispute.items.some((item) => item.type === "dispute" && item.href === "/matches")).toBe(true);

    const firstUnread = adminAfterDispute.items.find((item) => !item.readAt);
    if (!firstUnread) throw new Error("Expected an unread admin notification.");
    await adminCaller.notifications.markRead({ notificationId: firstUnread.id });
    const afterRead = await adminCaller.notifications.list();
    expect(afterRead.items.find((item) => item.id === firstUnread.id)?.readAt).not.toBeNull();
    await adminCaller.notifications.markAllRead();
    expect((await adminCaller.notifications.list()).unreadCount).toBe(0);
  });
});
