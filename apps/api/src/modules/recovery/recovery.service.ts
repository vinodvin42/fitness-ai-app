import { prisma } from "../../db/prisma";
import { UpsertRecoveryInput } from "./recovery.schema";

/**
 * Recovery & Devices — manual-entry stopgap (docs/mobile Phase 2 §E), added
 * 31 Aug 2026. The module was blocked because no honest device data source
 * (HealthKit/Google Fit) exists in this build. Decision: let the user enter
 * their own resting HR / sleep / HRV / soreness / energy — real,
 * self-reported data honestly labelled as such, the same "real stopgap, not
 * a faked device feed" precedent as ProgressPhoto's base64 storage. One row
 * per day per user (upserted); a future native-wearable integration can fill
 * the same `RecoveryLog` fields without a schema change.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

const RANGE_DAYS = 30;

function dateOnlyUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y, m - 1, d));
}

type RecoveryRow = {
  id: string;
  date: Date;
  restingHeartRate: number | null;
  sleepHours: number | null;
  hrvMs: number | null;
  soreness: number | null;
  energyLevel: number | null;
  notes: string | null;
};

function toItem(r: RecoveryRow) {
  return {
    id: r.id,
    date: r.date,
    restingHeartRate: r.restingHeartRate,
    sleepHours: r.sleepHours,
    hrvMs: r.hrvMs,
    soreness: r.soreness,
    energyLevel: r.energyLevel,
    notes: r.notes,
  };
}

function average(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10;
}

export async function listRecovery(userId: string) {
  const since = new Date(Date.now() - RANGE_DAYS * 24 * 60 * 60 * 1000);
  const logs = (await prisma.recoveryLog.findMany({
    where: { userId, date: { gte: since } },
    orderBy: { date: "desc" },
  })) as RecoveryRow[];

  const averages = {
    restingHeartRate: average(logs.map((l) => l.restingHeartRate)),
    sleepHours: average(logs.map((l) => l.sleepHours)),
    hrvMs: average(logs.map((l) => l.hrvMs)),
    soreness: average(logs.map((l) => l.soreness)),
    energyLevel: average(logs.map((l) => l.energyLevel)),
  };

  return {
    logs: logs.map(toItem),
    latest: logs.length > 0 ? toItem(logs[0]) : null,
    averages,
    rangeDays: RANGE_DAYS,
    source: "self_reported" as const,
  };
}

export async function upsertRecovery(userId: string, input: UpsertRecoveryInput) {
  const date = dateOnlyUtc(input.date);
  const data = {
    restingHeartRate: input.restingHeartRate ?? null,
    sleepHours: input.sleepHours ?? null,
    hrvMs: input.hrvMs ?? null,
    soreness: input.soreness ?? null,
    energyLevel: input.energyLevel ?? null,
    notes: input.notes ?? null,
  };

  const log = await prisma.recoveryLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...data },
    update: data,
  });

  return toItem(log as RecoveryRow);
}
