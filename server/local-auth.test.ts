import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { authSessions, authTokens, leaguePlayers, leagues, localCredentials, notifications, users } from "../drizzle/schema";
import { getDb } from "./db";
import { getEmailProviderConfig, isEmailProviderConfigured, sendTransactionalEmail } from "./email";
import { allocateTestPlayerIds } from "./test-player-ids";
import { consumeAuthToken, createAuthToken, createLocalSession, hashAuthToken, hashPassword, localCredentialForEmail, revokeAuthTokens, revokeLocalSession, validateLocalSession, verifyPassword, LOCAL_SESSION_TTL_MS } from "./local-auth";
import { registerOAuthRoutes } from "./_core/oauth";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const temporaryUserIds: number[] = [];

async function deleteTemporaryUsers() {
  const db = await getDb();
  if (!db || !temporaryUserIds.length) return;
  await db.delete(users).where(inArray(users.id, temporaryUserIds));
}

afterAll(deleteTemporaryUsers);

describe("local authentication primitives", () => {
  it("hashes passwords with scrypt and rejects incorrect passwords", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);
    expect(hash).toMatch(/^scrypt\$N=16384,r=8,p=1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
    await expect(hashPassword("short")).rejects.toThrow("at least 12 characters");
  });

  it("generates a one-way token hash and leaves email delivery disabled until configured", async () => {
    const token = "sample-secure-token";
    expect(hashAuthToken(token)).toHaveLength(64);
    expect(hashAuthToken(token)).not.toBe(token);
    expect(isEmailProviderConfigured(getEmailProviderConfig({}))).toBe(false);
    await expect(sendTransactionalEmail({ to: "player@example.test", subject: "Test", text: "Test" }, getEmailProviderConfig({}))).resolves.toEqual({ sent: false, reason: "not_configured" });
  });

  it("keeps the Manus OAuth callback registered during the staged migration", () => {
    const routes: string[] = [];
    registerOAuthRoutes({ get: (path: string) => { routes.push(path); return undefined as never; } } as never);
    expect(routes).toContain("/api/oauth/callback");
  });
});

describeWithDatabase("local authentication database foundation", () => {
  it("creates, validates, expires, revokes, and consumes auth records without changing user relationships", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for this integration test.");
    const beforeUsers = await db.select({ id: users.id, openId: users.openId, playerId: users.playerId, role: users.role }).from(users).where(eq(users.id, 1)).orderBy(asc(users.id));
    const beforeLeagues = await db.select({ id: leagues.id, createdBy: leagues.createdBy }).from(leagues).where(eq(leagues.id, 1)).orderBy(asc(leagues.id));
    const beforeMemberships = await db.select({ id: leaguePlayers.id, leagueId: leaguePlayers.leagueId, userId: leaguePlayers.userId, teamId: leaguePlayers.teamId, registrationStatus: leaguePlayers.registrationStatus }).from(leaguePlayers).where(eq(leaguePlayers.leagueId, 1)).orderBy(asc(leaguePlayers.id));
    const beforeNotifications = await db.select({ id: notifications.id, userId: notifications.userId, type: notifications.type, readAt: notifications.readAt }).from(notifications).where(eq(notifications.userId, 1)).orderBy(asc(notifications.id));

    const [playerId] = await allocateTestPlayerIds(db, 1);
    const userResult = await db.insert(users).values({ openId: null, playerId, name: "Temporary Local User", role: "participant", accountTypeSelected: true });
    const userId = Number(userResult[0].insertId);
    temporaryUserIds.push(userId);
    const email = `local-foundation-${userId}@example.test`;
    const passwordHash = await hashPassword("temporary local password");
    await db.insert(localCredentials).values({ userId, email, passwordHash });
    const credential = await localCredentialForEmail(email.toUpperCase());
    expect(credential?.user.id).toBe(userId);
    expect(credential?.credential.passwordHash).not.toBe("temporary local password");

    const now = new Date();
    const session = await createLocalSession(userId, now);
    expect(session.rawToken).not.toBe(hashAuthToken(session.rawToken));
    expect((await validateLocalSession(session.rawToken, now))?.user.id).toBe(userId);
    const expiredSession = await createLocalSession(userId, new Date(now.getTime() - LOCAL_SESSION_TTL_MS - 1000));
    expect(await validateLocalSession(expiredSession.rawToken, now)).toBeNull();
    await revokeLocalSession(session.rawToken, now);
    expect(await validateLocalSession(session.rawToken, now)).toBeNull();

    const resetToken = await createAuthToken({ userId, type: "password_reset", expiresInMs: 30_000, now });
    expect(await consumeAuthToken({ rawToken: resetToken, type: "password_reset", now })).toBe(userId);
    expect(await consumeAuthToken({ rawToken: resetToken, type: "password_reset", now })).toBeNull();
    const expiredToken = await createAuthToken({ userId, type: "email_verification", expiresInMs: 1, now: new Date(now.getTime() - 10_000) });
    expect(await consumeAuthToken({ rawToken: expiredToken, type: "email_verification", now })).toBeNull();
    await revokeAuthTokens(userId, "password_reset", now);

    const afterUsers = await db.select({ id: users.id, openId: users.openId, playerId: users.playerId, role: users.role }).from(users).where(eq(users.id, 1)).orderBy(asc(users.id));
    const afterLeagues = await db.select({ id: leagues.id, createdBy: leagues.createdBy }).from(leagues).where(eq(leagues.id, 1)).orderBy(asc(leagues.id));
    const afterMemberships = await db.select({ id: leaguePlayers.id, leagueId: leaguePlayers.leagueId, userId: leaguePlayers.userId, teamId: leaguePlayers.teamId, registrationStatus: leaguePlayers.registrationStatus }).from(leaguePlayers).where(eq(leaguePlayers.leagueId, 1)).orderBy(asc(leaguePlayers.id));
    const afterNotifications = await db.select({ id: notifications.id, userId: notifications.userId, type: notifications.type, readAt: notifications.readAt }).from(notifications).where(eq(notifications.userId, 1)).orderBy(asc(notifications.id));
    expect(afterUsers).toEqual(beforeUsers);
    expect(afterLeagues).toEqual(beforeLeagues);
    expect(afterMemberships).toEqual(beforeMemberships);
    expect(afterNotifications).toEqual(beforeNotifications);
  });
});
