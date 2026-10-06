import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { ListNotificationsQuery, RegisterPushTokenInput } from "./notifications.schema";

/**
 * In-app notification inbox + push-token storage. Nothing here sends a
 * push — tokens are stored so a future sender can use them. Other modules
 * create inbox rows via createNotification().
 */

export type NotificationKindValue = "reminder" | "workout" | "nutrition" | "coach" | "billing" | "system";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  deepLink: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function toItem(n: NotificationRow) {
  return {
    id: n.id,
    kind: n.kind as NotificationKindValue,
    title: n.title,
    body: n.body,
    deepLink: n.deepLink,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

/**
 * Internal helper for other modules. Never throws — a failed inbox write
 * must not break the event (payment, message, ...) that triggered it.
 */
export async function createNotification(
  userId: string,
  input: { kind: NotificationKindValue; title: string; body: string; deepLink?: string | null },
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        kind: input.kind,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 1000),
        deepLink: input.deepLink ?? null,
      },
    });
  } catch (err) {
    console.error("createNotification failed:", err);
  }
}

export async function listNotifications(userId: string, query: ListNotificationsQuery) {
  const where = {
    userId,
    dismissedAt: null,
    ...(query.filter === "unread" ? { readAt: null } : {}),
    ...(query.category ? { kind: (query.category === "workouts" ? "workout" : "nutrition") as NotificationKindValue } : {}),
  };
  const rows = (await prisma.notification.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  })) as NotificationRow[];

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null, dismissedAt: null } });

  return {
    items: page.map(toItem),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    unreadCount,
  };
}

export async function markRead(userId: string, notificationId: string) {
  const existing = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!existing || existing.userId !== userId) {
    throw new ApiHttpError(404, "notification_not_found", "Notification not found");
  }
  if (existing.readAt) return toItem(existing as NotificationRow);
  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
  return toItem(updated as NotificationRow);
}

/** Swipe-to-dismiss: hides the row from every list/count; the row itself is kept. Idempotent. */
export async function dismiss(userId: string, notificationId: string) {
  const existing = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!existing || existing.userId !== userId) {
    throw new ApiHttpError(404, "notification_not_found", "Notification not found");
  }
  if (!existing.dismissedAt) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { dismissedAt: new Date(), readAt: existing.readAt ?? new Date() },
    });
  }
  return { id: notificationId, dismissed: true as const };
}

export async function markAllRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, dismissedAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

export async function registerPushToken(userId: string, input: RegisterPushTokenInput) {
  // A token belongs to whoever registered it last (device changed hands).
  const row = await prisma.pushToken.upsert({
    where: { token: input.token },
    create: { userId, token: input.token, platform: input.platform },
    update: { userId, platform: input.platform },
  });
  return { id: row.id, platform: row.platform, createdAt: row.createdAt };
}

export async function removePushToken(userId: string, token: string) {
  await prisma.pushToken.deleteMany({ where: { userId, token } });
}
