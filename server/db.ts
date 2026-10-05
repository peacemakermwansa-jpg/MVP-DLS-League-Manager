import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

type UpsertUser = Omit<InsertUser, "playerId"> & { playerId?: number };

async function generatePlayerId(db: ReturnType<typeof drizzle>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = randomInt(100000, 1000000);
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.playerId, candidate)).limit(1);
    if (!rows[0]) return candidate;
  }
  throw new Error("Could not allocate a unique Player ID.");
}

function isDuplicateKeyError(error: unknown) {
  const candidate = error as { code?: string; errno?: number };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: UpsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) updateSet.lastSignedIn = user.lastSignedIn;
    if (user.role !== undefined) {
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      updateSet.role = "admin";
    }
    if (user.accountTypeSelected !== undefined) {
      updateSet.accountTypeSelected = user.accountTypeSelected;
    } else if (user.openId === ENV.ownerOpenId) {
      updateSet.accountTypeSelected = true;
    }
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    const existing = await db.select({ playerId: users.playerId }).from(users).where(eq(users.openId, user.openId)).limit(1);
    if (existing[0]) {
      await db.update(users).set(updateSet).where(eq(users.openId, user.openId));
      return;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const playerId = user.playerId ?? await generatePlayerId(db);
      try {
        await db.insert(users).values({ openId: user.openId, playerId, ...updateSet });
        return;
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const racedUser = await db.select({ playerId: users.playerId }).from(users).where(eq(users.openId, user.openId)).limit(1);
        if (racedUser[0]) {
          await db.update(users).set(updateSet).where(eq(users.openId, user.openId));
          return;
        }
      }
    }
    throw new Error("Could not create the user account without a unique Player ID.");
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function chooseAccountType(userId: number, role: "admin" | "participant") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available.");
  const existing = await db.select({ accountTypeSelected: users.accountTypeSelected }).from(users).where(eq(users.id, userId)).limit(1);
  if (!existing[0]) throw new Error("User account was not found.");
  if (existing[0].accountTypeSelected) throw new Error("Account type has already been selected.");
  const result = await db
    .update(users)
    .set({ role, accountTypeSelected: true })
    .where(eq(users.id, userId));
  if (result[0].affectedRows !== 1) throw new Error("User account was not found.");
  return { role, accountTypeSelected: true } as const;
}
