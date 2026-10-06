import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { ClearDoseQuery, CreateMedicationInput, DayQuery, LogDoseInput, UpdateMedicationInput } from "./medications.schema";

/**
 * Medicine tracking. A Medication carries a recurring schedule ("HH:MM"
 * times on given weekdays, in the user's local time); dose rows are only
 * written when the user logs one. "Due", "pending" and "missed" are
 * computed from the schedule + logs, never stored. Self-reported tracking,
 * not medical advice. The client passes tzOffsetMinutes (JS
 * getTimezoneOffset convention) so the server can resolve its local day.
 */

const MISSED_GRACE_MS = 2 * 60 * 60 * 1000;
const ADHERENCE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type MedRow = {
  id: string;
  userId: string;
  name: string;
  dosage: string;
  form: string | null;
  scheduleTimes: string[];
  daysOfWeek: number[];
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  repeatMode: string;
  mealTiming: string | null;
  pushEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  detailedPreview: boolean;
};

type DoseRow = {
  id: string;
  medicationId: string;
  scheduledFor: Date;
  status: string;
  snoozedUntil: Date | null;
  loggedAt: Date;
};

function toMedication(m: MedRow) {
  return {
    id: m.id,
    name: m.name,
    dosage: m.dosage,
    form: m.form,
    scheduleTimes: m.scheduleTimes,
    daysOfWeek: m.daysOfWeek,
    startDate: m.startDate,
    endDate: m.endDate,
    notes: m.notes,
    isActive: m.isActive,
    createdAt: m.createdAt,
    repeatMode: m.repeatMode,
    mealTiming: m.mealTiming,
    pushEnabled: m.pushEnabled,
    soundEnabled: m.soundEnabled,
    vibrationEnabled: m.vibrationEnabled,
    detailedPreview: m.detailedPreview,
  };
}

function toDose(d: DoseRow) {
  return {
    id: d.id,
    medicationId: d.medicationId,
    scheduledFor: d.scheduledFor,
    status: d.status,
    snoozedUntil: d.snoozedUntil,
    loggedAt: d.loggedAt,
  };
}

function dateOnlyUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y, m - 1, d));
}

/** The client's local calendar date for `now`, as a UTC-midnight Date. */
function localToday(now: Date, tzOffsetMinutes: number): Date {
  const local = new Date(now.getTime() - tzOffsetMinutes * 60000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** Concrete UTC instants at which `med` is scheduled on the local `day`. */
function dosesOnDay(med: MedRow, day: Date, tzOffsetMinutes: number): Date[] {
  if (!med.daysOfWeek.includes(day.getUTCDay())) return [];
  if (day < med.startDate) return [];
  if (med.endDate && day > med.endDate) return [];
  return med.scheduleTimes.map((t) => {
    const [h, m] = t.split(":").map((n) => Number(n));
    return new Date(day.getTime() + (h * 60 + m) * 60000 + tzOffsetMinutes * 60000);
  });
}

async function getOwnedMedication(userId: string, medicationId: string) {
  const med = await prisma.medication.findUnique({ where: { id: medicationId } });
  if (!med || med.userId !== userId) {
    // 404, not 403 — don't reveal that a medication id belongs to someone else.
    throw new ApiHttpError(404, "medication_not_found", "Medication not found");
  }
  return med as MedRow;
}

export async function listMedications(userId: string) {
  const rows = (await prisma.medication.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  })) as MedRow[];
  return { items: rows.map(toMedication) };
}

export async function createMedication(userId: string, input: CreateMedicationInput) {
  const row = await prisma.medication.create({
    data: {
      userId,
      name: input.name,
      dosage: input.dosage,
      form: input.form ?? null,
      scheduleTimes: [...input.scheduleTimes].sort(),
      daysOfWeek: input.daysOfWeek,
      startDate: dateOnlyUtc(input.startDate),
      endDate: input.endDate ? dateOnlyUtc(input.endDate) : null,
      notes: input.notes ?? null,
      isActive: input.isActive,
      repeatMode: input.repeatMode,
      mealTiming: input.mealTiming ?? null,
      pushEnabled: input.pushEnabled,
      soundEnabled: input.soundEnabled,
      vibrationEnabled: input.vibrationEnabled,
      detailedPreview: input.detailedPreview,
    },
  });
  await recordAudit({
    actorId: userId,
    action: "medication.created",
    entityType: "Medication",
    entityId: row.id,
    metadata: {},
  });
  return toMedication(row as MedRow);
}

export async function updateMedication(userId: string, medicationId: string, input: UpdateMedicationInput) {
  const existing = await getOwnedMedication(userId, medicationId);
  const { startDate, endDate, scheduleTimes, ...rest } = input;

  const mode = rest.repeatMode ?? existing.repeatMode;
  const nextStart = startDate ? dateOnlyUtc(startDate) : existing.startDate;
  let nextEnd = endDate === undefined ? existing.endDate : endDate ? dateOnlyUtc(endDate) : null;
  // "once" pins the single date; "daily" means every weekday.
  if (mode === "once") nextEnd = nextStart;
  else if (rest.repeatMode && existing.repeatMode === "once" && endDate === undefined) nextEnd = null;
  const forcedDays = mode === "once" || mode === "daily" ? [0, 1, 2, 3, 4, 5, 6] : undefined;
  if (nextEnd && nextEnd < nextStart) {
    throw new ApiHttpError(400, "validation_error", "endDate must not be before startDate");
  }

  const row = await prisma.medication.update({
    where: { id: medicationId },
    data: {
      ...rest,
      ...(scheduleTimes ? { scheduleTimes: [...scheduleTimes].sort() } : {}),
      ...(forcedDays && (rest.repeatMode || rest.daysOfWeek) ? { daysOfWeek: forcedDays } : {}),
      ...(startDate ? { startDate: nextStart } : {}),
      ...(endDate !== undefined || rest.repeatMode || (mode === "once" && startDate) ? { endDate: nextEnd } : {}),
    },
  });
  await recordAudit({
    actorId: userId,
    action: "medication.updated",
    entityType: "Medication",
    entityId: medicationId,
    metadata: {},
  });
  return toMedication(row as MedRow);
}

export async function deleteMedication(userId: string, medicationId: string) {
  await getOwnedMedication(userId, medicationId);
  await prisma.medication.delete({ where: { id: medicationId } });
  await recordAudit({
    actorId: userId,
    action: "medication.deleted",
    entityType: "Medication",
    entityId: medicationId,
    metadata: {},
  });
}

export async function getDueDoses(userId: string, query: DayQuery) {
  const now = new Date();
  const day = query.date ? dateOnlyUtc(query.date) : localToday(now, query.tzOffsetMinutes);

  const meds = (await prisma.medication.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: "asc" },
  })) as MedRow[];

  const planned = meds.flatMap((med) =>
    dosesOnDay(med, day, query.tzOffsetMinutes).map((scheduledFor) => ({ med, scheduledFor })),
  );
  const logs = planned.length
    ? ((await prisma.medicationDoseLog.findMany({
        where: {
          userId,
          medicationId: { in: meds.map((m) => m.id) },
          scheduledFor: { in: planned.map((p) => p.scheduledFor) },
        },
      })) as DoseRow[])
    : [];
  const logByKey = new Map(logs.map((l) => [`${l.medicationId}|${l.scheduledFor.getTime()}`, l]));

  const items = planned
    .map(({ med, scheduledFor }) => {
      const log = logByKey.get(`${med.id}|${scheduledFor.getTime()}`);
      let status: "taken" | "skipped" | "snoozed" | "pending" | "missed";
      if (log && (log.status === "taken" || log.status === "skipped")) {
        status = log.status;
      } else if (log?.snoozedUntil && log.snoozedUntil > now) {
        status = "snoozed";
      } else if (now.getTime() > scheduledFor.getTime() + MISSED_GRACE_MS) {
        status = "missed";
      } else {
        status = "pending";
      }
      return {
        medicationId: med.id,
        name: med.name,
        dosage: med.dosage,
        form: med.form,
        scheduledFor,
        status,
        snoozedUntil: log?.snoozedUntil ?? null,
        loggedAt: log?.loggedAt ?? null,
      };
    })
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());

  return { date: day.toISOString().slice(0, 10), items };
}

/** A logged Taken/Skipped entry can be corrected for 24h after its scheduled time. */
const CORRECTION_WINDOW_MS = DAY_MS;

function assertWithinCorrectionWindow(scheduledFor: Date, now: Date) {
  if (now.getTime() > scheduledFor.getTime() + CORRECTION_WINDOW_MS) {
    throw new ApiHttpError(409, "correction_window_closed", "This entry can no longer be changed.");
  }
}

export async function logDose(userId: string, medicationId: string, input: LogDoseInput) {
  await getOwnedMedication(userId, medicationId);
  const scheduledFor = new Date(input.scheduledFor);
  const now = new Date();
  const existing = (await prisma.medicationDoseLog.findUnique({
    where: { medicationId_scheduledFor: { medicationId, scheduledFor } },
  })) as DoseRow | null;

  // Identical repeat of a settled entry: idempotent no-op (keeps the original loggedAt).
  if (existing && existing.status === input.status && input.status !== "snoozed") {
    return toDose(existing);
  }
  // Correcting a logged Taken/Skipped entry (flip or re-log) is limited to 24h.
  if (existing && (existing.status === "taken" || existing.status === "skipped")) {
    assertWithinCorrectionWindow(scheduledFor, now);
  }

  const data = {
    status: input.status,
    snoozedUntil: input.status === "snoozed" ? new Date(input.snoozedUntil!) : null,
    loggedAt: now,
  };
  const row = await prisma.medicationDoseLog.upsert({
    where: { medicationId_scheduledFor: { medicationId, scheduledFor } },
    create: { medicationId, userId, scheduledFor, ...data },
    update: data,
  });
  await recordAudit({
    actorId: userId,
    action: existing ? "medication.dose_corrected" : "medication.dose_logged",
    entityType: "MedicationDoseLog",
    entityId: row.id,
    metadata: { status: input.status, previousStatus: existing?.status ?? null },
  });
  return toDose(row as DoseRow);
}

/** Clears a logged entry (mistaken Taken/Skipped, or Undo snooze): the occurrence reverts to due/missed. */
export async function clearDose(userId: string, medicationId: string, query: ClearDoseQuery) {
  await getOwnedMedication(userId, medicationId);
  const scheduledFor = new Date(query.scheduledFor);
  const existing = (await prisma.medicationDoseLog.findUnique({
    where: { medicationId_scheduledFor: { medicationId, scheduledFor } },
  })) as DoseRow | null;
  if (!existing) return; // idempotent
  if (existing.status === "taken" || existing.status === "skipped") {
    assertWithinCorrectionWindow(scheduledFor, new Date());
  }
  await prisma.medicationDoseLog.delete({ where: { id: existing.id } });
  await recordAudit({
    actorId: userId,
    action: "medication.dose_cleared",
    entityType: "MedicationDoseLog",
    entityId: existing.id,
    metadata: { previousStatus: existing.status },
  });
}

export async function getAdherence(userId: string, medicationId: string, query: DayQuery) {
  const med = await getOwnedMedication(userId, medicationId);
  const now = new Date();
  const today = localToday(now, query.tzOffsetMinutes);

  const days: Date[] = [];
  for (let i = ADHERENCE_DAYS - 1; i >= 0; i--) days.push(new Date(today.getTime() - i * DAY_MS));

  const logs = (await prisma.medicationDoseLog.findMany({
    where: {
      userId,
      medicationId,
      scheduledFor: { gte: new Date(days[0].getTime() + query.tzOffsetMinutes * 60000) },
    },
  })) as DoseRow[];
  const logByTime = new Map(logs.map((l) => [l.scheduledFor.getTime(), l]));

  let taken = 0;
  let skipped = 0;
  let missed = 0;
  for (const day of days) {
    for (const scheduledFor of dosesOnDay(med, day, query.tzOffsetMinutes)) {
      const log = logByTime.get(scheduledFor.getTime());
      if (log?.status === "taken") taken += 1;
      else if (log?.status === "skipped") skipped += 1;
      else if (now.getTime() > scheduledFor.getTime() + MISSED_GRACE_MS) missed += 1;
    }
  }

  const expected = taken + skipped + missed;
  return {
    medicationId,
    days: ADHERENCE_DAYS,
    taken,
    skipped,
    missed,
    adherencePct: expected > 0 ? Math.round((taken / expected) * 100) : null,
  };
}
