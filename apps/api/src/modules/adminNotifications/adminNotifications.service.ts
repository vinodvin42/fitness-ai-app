import { NotificationKind } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { isEmailConfigured } from "../../lib/mailer";

/**
 * 12.07 Notifications (docs/admin/03-screen-inventory.md §12.07), Oct 2026 —
 * a read-only view of what the notification system really does today:
 *
 * - In-app notifications (`Notification`): how many were created in the
 *   last 30 days, by kind, and how many were read.
 * - Push devices (`PushToken`): how many devices registered, by platform.
 *   **Nothing is sent to them yet** — the API has no push-sending code — so
 *   push is reported as "registration only", never as a working channel.
 * - Email: whether SMTP is configured on this server (used for account
 *   emails such as password resets).
 * - Preferences (`NotificationPreference`): opt-in rates among users who
 *   have saved their settings. Users who never opened the settings use the
 *   defaults (everything on except marketing), so they're counted
 *   separately rather than guessed.
 *
 * Not available: templates (titles and bodies are written in code where
 * each notification is created), gateway management, and broadcast sending.
 */

const WINDOW_DAYS = 30;

const PREFERENCE_FIELDS = [
  "masterEnabled",
  "workoutReminders",
  "mealReminders",
  "hydrationReminders",
  "coachMessages",
  "billing",
  "marketing",
] as const;

export async function getNotificationsOverview() {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (WINDOW_DAYS - 1)));

  const [byKind, readByKind, tokensByPlatform, usersWithPush, prefRows, quietHours, frequencyCaps, totalUsers] =
    await Promise.all([
      prisma.notification.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.notification.groupBy({
        by: ["kind"],
        where: { createdAt: { gte: since }, readAt: { not: null } },
        _count: { _all: true },
      }),
      prisma.pushToken.groupBy({ by: ["platform"], _count: { _all: true } }),
      prisma.pushToken.findMany({ distinct: ["userId"], select: { userId: true } }),
      prisma.notificationPreference.count(),
      prisma.notificationPreference.count({ where: { quietHoursStart: { not: null }, quietHoursEnd: { not: null } } }),
      prisma.notificationPreference.count({ where: { frequencyCap: { not: null } } }),
      prisma.user.count(),
    ]);

  const optIns = await Promise.all(
    PREFERENCE_FIELDS.map(async (field) => ({
      field,
      on: await prisma.notificationPreference.count({ where: { [field]: true } }),
    })),
  );

  const readMap = new Map(readByKind.map((r) => [r.kind, r._count._all]));
  const inApp = Object.values(NotificationKind).map((kind) => {
    const created = byKind.find((k) => k.kind === kind)?._count._all ?? 0;
    const read = readMap.get(kind) ?? 0;
    return { kind, created, read, readRate: created > 0 ? read / created : null };
  });

  return {
    windowDays: WINDOW_DAYS,
    since,
    inApp,
    channels: [
      { channel: "in_app", status: "working" as const },
      { channel: "push", status: "registration_only" as const },
      { channel: "email", status: isEmailConfigured() ? ("configured" as const) : ("not_configured" as const) },
    ],
    push: {
      devices: tokensByPlatform.reduce((sum, p) => sum + p._count._all, 0),
      usersWithDevice: usersWithPush.length,
      byPlatform: tokensByPlatform.map((p) => ({ platform: p.platform, devices: p._count._all })),
    },
    preferences: {
      totalUsers,
      usersWithSavedSettings: prefRows,
      usersOnDefaults: Math.max(0, totalUsers - prefRows),
      optIns: optIns.map((o) => ({ ...o, rate: prefRows > 0 ? o.on / prefRows : null })),
      quietHoursSet: quietHours,
      frequencyCapSet: frequencyCaps,
    },
    notAvailable: ["notificationTemplates", "notificationGateways", "pushSending", "broadcastSend"],
  };
}
