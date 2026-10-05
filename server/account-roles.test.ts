import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import { allocateTestPlayerIds } from "./test-player-ids";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const createdOpenIds: string[] = [];

function contextFor(user: NonNullable<TrpcContext["user"]>): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describeWithDatabase("account role and league ownership separation", () => {
  afterAll(async () => {
    const db = await getDb();
    if (!db || !createdOpenIds.length) return;
    await db.delete(users).where(inArray(users.openId, createdOpenIds));
  });

  it("allows admins to participate elsewhere while blocking cross-league management", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for this integration test.");
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const accountAOpenId = `roles-admin-a-${suffix}`;
    const accountBOpenId = `roles-admin-b-${suffix}`;
    const accountCOpenId = `roles-participant-c-${suffix}`;
    createdOpenIds.push(accountAOpenId, accountBOpenId, accountCOpenId);
    const [accountAPlayerId, accountBPlayerId, accountCPlayerId] = await allocateTestPlayerIds(db, 3);
    await db.insert(users).values([
      { openId: accountAOpenId, playerId: accountAPlayerId, name: "Admin A", email: `${accountAOpenId}@example.test`, loginMethod: "test", role: "admin", accountTypeSelected: true },
      { openId: accountBOpenId, playerId: accountBPlayerId, name: "Admin B", email: `${accountBOpenId}@example.test`, loginMethod: "test", role: "admin", accountTypeSelected: true },
      { openId: accountCOpenId, playerId: accountCPlayerId, name: "Participant C", email: `${accountCOpenId}@example.test`, loginMethod: "test", role: "participant", accountTypeSelected: true },
    ]);
    const rows = await db.select().from(users).where(inArray(users.openId, createdOpenIds));
    const accountA = rows.find((row) => row.openId === accountAOpenId);
    const accountB = rows.find((row) => row.openId === accountBOpenId);
    const accountC = rows.find((row) => row.openId === accountCOpenId);
    if (!accountA || !accountB || !accountC) throw new Error("Role test accounts were not created.");
    const callerA = appRouter.createCaller(contextFor(accountA));
    const callerB = appRouter.createCaller(contextFor(accountB));
    const callerC = appRouter.createCaller(contextFor(accountC));

    const leagueA = await callerA.league.create({ name: "Role League A", seasonName: "Role Season", numberOfTeams: 2 });
    const leagueB = await callerB.league.create({ name: "Role League B", seasonName: "Role Season", numberOfTeams: 2 });
    expect((await callerA.league.overview()).map((league) => league.id)).toContain(leagueA.id);
    expect((await callerB.league.overview()).map((league) => league.id)).toContain(leagueB.id);

    await expect(callerC.league.create({ name: "Blocked League", seasonName: "Role Season", numberOfTeams: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await callerC.player.register({ leagueId: leagueA.id, playerName: "Participant C", username: `participant_c_${accountC.playerId}` });
    await callerA.player.register({ leagueId: leagueB.id, playerName: "Admin A", username: `admin_a_${accountA.playerId}` });
    await callerB.player.register({ leagueId: leagueA.id, playerName: "Admin B", username: `admin_b_${accountB.playerId}` });

    await expect(callerA.league.dashboard({ leagueId: leagueB.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerB.league.dashboard({ leagueId: leagueA.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerA.playerAdmin.list({ leagueId: leagueB.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerC.playerAdmin.list({ leagueId: leagueA.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect((await callerA.player.dashboard()).some((item) => item.league.id === leagueB.id)).toBe(true);
    expect((await callerB.player.dashboard()).some((item) => item.league.id === leagueA.id)).toBe(true);
    expect((await callerC.player.dashboard()).some((item) => item.league.id === leagueA.id)).toBe(true);
  });
});
