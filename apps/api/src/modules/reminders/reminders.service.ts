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

/** YYYY-MM-DD to UTC midnight; null stays null (clears the limit); undefined leaves it unchanged. */
function dateField(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  return v === null ? null : new Date(`${v}T00:00:00.000Z`);
}

function withDates<T extends { startDate?: string | null; endDate?: string | null }>(input: T) {
  const { startDate, endDate, ...rest } = input;
  return {
    ...rest,
    ...(startDate !== undefined ? { startDate: dateField(startDate) } : {}),
    ...(endDate !== undefined ? { endDate: dateField(endDate) } : {}),
  };
}

export async function listReminders(userId: string) {
  return prisma.reminder.findMany({
    where: { userId },
    orderBy: [{ hour: "asc" }, { minute: "asc" }],
  });
}

export async function createReminder(userId: string, input: CreateReminderInput) {
  const reminder = await prisma.reminder.create({
    data: { userId, ...withDates(input) },
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
  const current = await getOwnedReminder(reminderId, userId);
  // With only one end of the range sent, check it against the stored other end.
  const start = input.startDate !== undefined ? input.startDate : current.startDate ? current.startDate.toISOString().slice(0, 10) : null;
  const end = input.endDate !== undefined ? input.endDate : current.endDate ? current.endDate.toISOString().slice(0, 10) : null;
  if (start && end && end < start) {
    throw new ApiHttpError(400, "reminder_end_before_start", "The end date can't be before the start date");
  }

  const reminder = await prisma.reminder.update({
    where: { id: reminderId },
    data: withDates(input),
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
