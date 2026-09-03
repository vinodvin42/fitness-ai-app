import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { CreateReminderInput, UpdateReminderInput } from "./reminders.schema";

/**
 * Reminders (docs/mobile/03-screen-inventory.md §K "Add Reminder") — Phase 4.
 * These are purely local, on-device notifications scheduled by the client
 * via expo-notifications (see apps/user-mobile's
 * src/lib/reminderNotifications.ts); this module is just CRUD + ownership
 * for the underlying settings the client schedules from. There's no
 * server-push infrastructure here — the server never sends anything to a
 * device, it only stores what the client should schedule locally.
 *
 * Unlike every other module in this API, a Reminder is a genuinely
 * deletable "setting" rather than meaningful history (contrast with
 * Subscriptions/ProgramPurchases/WorkoutSessions, which are never deleted,
 * only superseded) — so this is the first module with a real DELETE
 * endpoint.
 */

async function getOwnedReminder(reminderId: string, userId: string) {
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder || reminder.userId !== userId) {
    // 404, not 403 — don't reveal that a reminder ID belongs to someone else.
    throw new ApiHttpError(404, "reminder_not_found", "Reminder not found");
  }
  return reminder;
}

export async function listReminders(userId: string) {
  return prisma.reminder.findMany({
    where: { userId },
    orderBy: [{ hour: "asc" }, { minute: "asc" }],
  });
}

export async function createReminder(userId: string, input: CreateReminderInput) {
  const reminder = await prisma.reminder.create({
    data: { userId, ...input },
  });

  await recordAudit({
    actorId: userId,
    action: "reminder.created",
    entityType: "Reminder",
    entityId: reminder.id,
    metadata: { category: reminder.category, hour: reminder.hour, minute: reminder.minute },
  });

  return reminder;
}

export async function updateReminder(userId: string, reminderId: string, input: UpdateReminderInput) {
  await getOwnedReminder(reminderId, userId);

  const reminder = await prisma.reminder.update({
    where: { id: reminderId },
    data: input,
  });

  await recordAudit({
    actorId: userId,
    action: "reminder.updated",
    entityType: "Reminder",
    entityId: reminder.id,
    metadata: input,
  });

  return reminder;
}

export async function deleteReminder(userId: string, reminderId: string) {
  await getOwnedReminder(reminderId, userId);

  await prisma.reminder.delete({ where: { id: reminderId } });

  // Recorded even though the row itself is now gone — the audit log is
  // write-once and never references live rows, so this is still a durable
  // record that the deletion happened.
  await recordAudit({
    actorId: userId,
    action: "reminder.deleted",
    entityType: "Reminder",
    entityId: reminderId,
    metadata: {},
  });
}
