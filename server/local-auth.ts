import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { authSessions, authTokens, localCredentials, users } from "../drizzle/schema";
import { getDb } from "./db";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 32 * 1024 * 1024;
export const LOCAL_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;
export const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type AuthTokenType = "password_reset" | "email_verification";

function scryptAsync(password: string, salt: Buffer, keyLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
  return db;
}

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

export function generateSecureToken() {
  return randomBytes(32).toString("base64url");
}

export function hashAuthToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function hashPassword(password: string) {
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  const parts = encodedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`) return false;
  const [, , saltHex, derivedHex] = parts;
  if (!/^[0-9a-f]{32}$/i.test(saltHex) || !/^[0-9a-f]{128}$/i.test(derivedHex)) return false;
  const expected = Buffer.from(derivedHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), SCRYPT_KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createLocalSession(userId: number, now = new Date()) {
  const db = await requireDb();
  const rawToken = generateSecureToken();
  const expiresAt = new Date(now.getTime() + LOCAL_SESSION_TTL_MS);
  await db.insert(authSessions).values({ userId, tokenHash: hashAuthToken(rawToken), expiresAt, lastSeenAt: now });
  return { rawToken, expiresAt };
}

export async function validateLocalSession(rawToken: string, now = new Date()) {
  if (!rawToken) return null;
  const db = await requireDb();
  const rows = await db.select({ session: authSessions, user: users }).from(authSessions).innerJoin(users, eq(users.id, authSessions.userId)).where(and(eq(authSessions.tokenHash, hashAuthToken(rawToken)), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now))).limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.update(authSessions).set({ lastSeenAt: now }).where(eq(authSessions.id, row.session.id));
  return row;
}

export async function revokeLocalSession(rawToken: string, now = new Date()) {
  if (!rawToken) return;
  const db = await requireDb();
  await db.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.tokenHash, hashAuthToken(rawToken)), isNull(authSessions.revokedAt)));
}

export async function createAuthToken(input: { userId: number; type: AuthTokenType; expiresInMs: number; now?: Date }) {
  const db = await requireDb();
  const now = input.now ?? new Date();
  const rawToken = generateSecureToken();
  await db.insert(authTokens).values({ userId: input.userId, type: input.type, tokenHash: hashAuthToken(rawToken), expiresAt: new Date(now.getTime() + input.expiresInMs) });
  return rawToken;
}

/** Atomically consumes a valid token so a reset or verification token cannot be reused. */
export async function consumeAuthToken(input: { rawToken: string; type: AuthTokenType; now?: Date }) {
  if (!input.rawToken) return null;
  const db = await requireDb();
  const now = input.now ?? new Date();
  const result = await db.update(authTokens).set({ consumedAt: now }).where(and(eq(authTokens.tokenHash, hashAuthToken(input.rawToken)), eq(authTokens.type, input.type), isNull(authTokens.consumedAt), isNull(authTokens.revokedAt), gt(authTokens.expiresAt, now)));
  if (result[0].affectedRows !== 1) return null;
  const rows = await db.select({ userId: authTokens.userId }).from(authTokens).where(and(eq(authTokens.tokenHash, hashAuthToken(input.rawToken)), eq(authTokens.type, input.type))).limit(1);
  return rows[0]?.userId ?? null;
}

export async function revokeAuthTokens(userId: number, type?: AuthTokenType, now = new Date()) {
  const db = await requireDb();
  await db.update(authTokens).set({ revokedAt: now }).where(and(eq(authTokens.userId, userId), type ? eq(authTokens.type, type) : undefined, isNull(authTokens.consumedAt), isNull(authTokens.revokedAt)));
}

export async function localCredentialForEmail(email: string) {
  const db = await requireDb();
  const rows = await db.select({ credential: localCredentials, user: users }).from(localCredentials).innerJoin(users, eq(users.id, localCredentials.userId)).where(eq(localCredentials.email, normalizeAuthEmail(email))).limit(1);
  return rows[0] ?? null;
}
