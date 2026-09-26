import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { users } from "../drizzle/schema";
import { getDb, getUserByOpenId, upsertUser } from "./db";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const createdOpenIds: string[] = [];

describeWithDatabase("Player ID persistence", () => {
  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const openId of createdOpenIds) await db.delete(users).where(eq(users.openId, openId));
  });

  it("generates a six-digit Player ID once and preserves it on later upserts", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const openId = `player-id-${suffix}`;
    createdOpenIds.push(openId);

    await upsertUser({ openId, name: "Generated Player", loginMethod: "test" });
    const first = await getUserByOpenId(openId);
    expect(first?.playerId).toBeGreaterThanOrEqual(100000);
    expect(first?.playerId).toBeLessThanOrEqual(999999);

    await upsertUser({ openId, name: "Generated Player Updated", loginMethod: "test" });
    const second = await getUserByOpenId(openId);
    expect(second?.playerId).toBe(first?.playerId);
    expect(second?.name).toBe("Generated Player Updated");
  });
});
