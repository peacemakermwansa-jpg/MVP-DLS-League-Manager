import { inArray } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { users } from "../drizzle/schema";

type TestDb = Awaited<ReturnType<typeof import("./db").getDb>>;

export async function allocateTestPlayerIds(db: NonNullable<TestDb>, count: number): Promise<number[]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const start = randomInt(100000, 1000000 - count);
    const candidates = Array.from({ length: count }, (_, index) => start + index);
    const existing = await db
      .select({ playerId: users.playerId })
      .from(users)
      .where(inArray(users.playerId, candidates))
      .limit(1);
    if (existing.length === 0) return candidates;
  }
  throw new Error("Could not allocate collision-free test Player IDs.");
}
