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

/** True when `now` (server-local HH:MM) falls inside the user's quiet-hours window (handles overnight windows). */
export function isWithinQuietHours(start: string | null, end: string | null, now: Date): boolean {
  if (!start || !end || start === end) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  const s = toMin(start);
  const e = toMin(end);
  return s < e ? mins >= s && mins < e : mins >= s || mins < e;
}

const KIND_TO_CATEGORY: Partial<Record<NotificationKindValue, "workoutReminders" | "mealReminders" | "coachMessages" | "billing">> = {
  workout: "workoutReminders",
  nutrition: "mealReminders",
  coach: "coachMessages",
  billing: "billing",
};

export type DeliveryDecision = {
  /** Whether an inbox row should be created at all. */
  deliver: boolean;
  /** Why it was suppressed (undefined when delivered). */
  reason?: "paused" | "category_off" | "frequency_cap";
  /**
   * True when the user's quiet hours are active right now. The inbox row is
   * still written (it is passive - nothing buzzes the device); a future push
   * sender must hold or silence the push while this is true.
   */
  quiet: boolean;
};

/**
 * Central delivery policy for server-created notifications: the user's
 * master pause, per-category toggle and daily frequency cap decide whether a
 * row is created. `system` notifications (security / account) are never
 * suppressed. No preference row = defaults (everything on, no cap).
 */
export async function evaluateDelivery(userId: string, kind: NotificationKindValue, now: Date = new Date()): Promise<DeliveryDecision> {
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!prefs) return { deliver: true, quiet: false };
  const quiet = isWithinQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd, now);
  if (kind === "system") return { deliver: true, quiet };
  if (!prefs.masterEnabled) return { deliver: false, reason: "paused", quiet };
  const category = KIND_TO_CATEGORY[kind];
  if (category && !prefs[category]) return { deliver: false, reason: "category_off", quiet };
  if (prefs.frequencyCap != null) {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sent = await prisma.notification.count({ where: { userId, createdAt: { gte: since } } });
    if (sent >= prefs.frequencyCap) return { deliver: false, reason: "frequency_cap", quiet };
  }
  return { deliver: true, quiet };
}

/**
 * Internal helper for other modules. Never throws - a failed inbox write
 * must not break the event (payment, message, ...) that triggered it.
 * Honours the user's notification preferences via evaluateDelivery().
 */
export async function createNotification(
  userId: string,
  input: { kind: NotificationKindValue; title: string; body: string; deepLink?: string | null },
): Promise<void> {
  try {
    const decision = await evaluateDelivery(userId, input.kind);
    if (!decision.deliver) return;
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
