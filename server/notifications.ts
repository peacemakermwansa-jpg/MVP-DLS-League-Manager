import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { notifications } from "../drizzle/schema";
import { getDb } from "./db";

export type NotificationType = "join_request" | "approval" | "dispute";
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
  return db;
}

export async function createNotification(
  db: Db,
  input: { userId: number; type: NotificationType; title: string; message: string; href?: string },
) {
  await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    href: input.href ?? null,
  });
}

export async function listNotifications(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(50);
  const unreadRows = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { items: rows, unreadCount: unreadRows.length };
}

export async function markNotificationRead(input: { notificationId: number; userId: number }) {
  const db = await requireDb();
  const result = await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, input.userId), isNull(notifications.readAt)));
  if (result[0].affectedRows === 0) {
    const owned = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, input.userId))).limit(1);
    if (!owned[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found." });
  }
  return { success: true } as const;
}

export async function markAllNotificationsRead(userId: number) {
  const db = await requireDb();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { success: true } as const;
}
