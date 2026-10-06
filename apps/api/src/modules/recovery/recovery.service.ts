import { prisma } from "../../db/prisma";
import { UpsertRecoveryInput } from "./recovery.schema";
import { computeReadiness } from "./readiness";

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
  steps?: number | null;
  activeCalories?: number | null;
  activeMinutes?: number | null;
  spo2?: number | null;
  stressScore?: number | null;
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
    steps: r.steps ?? null,
    activeCalories: r.activeCalories ?? null,
    activeMinutes: r.activeMinutes ?? null,
    spo2: r.spo2 ?? null,
    stressScore: r.stressScore ?? null,
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
  // Only write the fields the caller sent, so saving soreness/energy never
  // wipes device-synced sleep / HR / HRV / steps for the same day.
  const data = {
    ...(input.restingHeartRate != null ? { restingHeartRate: input.restingHeartRate } : {}),
    ...(input.sleepHours != null ? { sleepHours: input.sleepHours } : {}),
    ...(input.hrvMs != null ? { hrvMs: input.hrvMs } : {}),
    ...(input.soreness != null ? { soreness: input.soreness } : {}),
    ...(input.energyLevel != null ? { energyLevel: input.energyLevel } : {}),
    ...(input.notes != null ? { notes: input.notes } : {}),
  };

  const log = await prisma.recoveryLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...data },
    update: data,
  });

  return toItem(log as RecoveryRow);
}

/**
 * GET /recovery/readiness - see ./readiness.ts for the documented formula.
 * `source` says where the numbers came from: a connected device that synced
 * on/after the log's day ("device"), otherwise the user's own entry
 * ("manual"). RecoveryLog has no per-row source column, so a same-day device
 * sync is the honest signal available.
 */
export async function getReadiness(userId: string) {
  const since = new Date(Date.now() - RANGE_DAYS * 24 * 60 * 60 * 1000);
  const logs = (await prisma.recoveryLog.findMany({
    where: { userId, date: { gte: since } },
    orderBy: { date: "desc" },
    take: 40,
  })) as Array<RecoveryRow & { updatedAt: Date }>;
  const latest = logs[0] ?? null;
  const result = computeReadiness(latest, logs.slice(1));

  let source: { kind: "manual" | "device"; name: string | null; at: Date } | null = null;
  if (latest) {
    const device = await prisma.connectedDevice.findFirst({
      where: { userId, lastSyncAt: { gte: latest.date } },
      orderBy: { lastSyncAt: "desc" },
    });
    const deviceMetrics = latest.sleepHours != null || latest.hrvMs != null || latest.restingHeartRate != null;
    source =
      device && deviceMetrics && device.lastSyncAt
        ? { kind: "device", name: device.name, at: device.lastSyncAt }
        : { kind: "manual", name: null, at: latest.updatedAt };
  }

  return {
    ...result,
    basis: "Based on your logged data",
    date: latest?.date ?? null,
    source,
    metrics: latest
      ? {
          sleepHours: latest.sleepHours,
          hrvMs: latest.hrvMs,
          restingHeartRate: latest.restingHeartRate,
          soreness: latest.soreness,
          energyLevel: latest.energyLevel,
        }
      : null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function stressLevel(score: number): "low" | "moderate" | "high" {
  return score < 34 ? "low" : score < 67 ? "moderate" : "high";
}

function mean(values: Array<number | null>): { avg: number; n: number } | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return { avg: nums.reduce((a, b) => a + b, 0) / nums.length, n: nums.length };
}

/**
 * Rule-based insight from real trends: compares the average over the last 7
 * days with the 7 days before (needs >= 3 logged values in each window and a
 * >= 5% change). Sleep is preferred, then HRV. Returns null otherwise - no
 * generic filler text.
 */
export function buildInsight(
  logs: Array<{ date: Date; sleepHours: number | null; hrvMs: number | null }>,
  now: number = Date.now(),
): { kind: "sleep" | "hrv"; text: string; changePct: number } | null {
  const inWindow = (from: number, to: number) => logs.filter((l) => l.date.getTime() > now - to * DAY_MS && l.date.getTime() <= now - from * DAY_MS);
  const thisWeek = inWindow(0, 7);
  const lastWeek = inWindow(7, 14);
  for (const m of [
    { kind: "sleep" as const, label: "sleep", pick: (l: { sleepHours: number | null }) => l.sleepHours },
    { kind: "hrv" as const, label: "HRV", pick: (l: { hrvMs: number | null }) => l.hrvMs },
  ]) {
    const a = mean(thisWeek.map(m.pick));
    const b = mean(lastWeek.map(m.pick));
    if (!a || !b || a.n < 3 || b.n < 3 || b.avg <= 0) continue;
    const pct = Math.round(((a.avg - b.avg) / b.avg) * 100);
    if (Math.abs(pct) < 5) continue;
    const dir = pct > 0 ? "up" : "down";
    const text =
      m.kind === "sleep"
        ? `Your sleep averaged ${a.avg.toFixed(1)} h over the last 7 days, ${dir} ${Math.abs(pct)}% from the week before.${pct > 0 ? " Keep your bedtime routine steady." : " An earlier, consistent bedtime may help."}`
        : `Your HRV averaged ${Math.round(a.avg)} ms over the last 7 days, ${dir} ${Math.abs(pct)}% from the week before.`;
    return { kind: m.kind, text, changePct: pct };
  }
  return null;
}

/**
 * GET /recovery/summary - the real values behind the Recovery dashboard:
 * today's (or yesterday's) activity + stress, a rule-based insight, and the
 * user's most recent synced device. Every field is null when no data exists.
 */
export async function getSummary(userId: string) {
  const since = new Date(Date.now() - 15 * DAY_MS);
  const logs = (await prisma.recoveryLog.findMany({
    where: { userId, date: { gte: since } },
    orderBy: { date: "desc" },
  })) as RecoveryRow[];
  const latest = logs[0] ?? null;
  // Activity/stress only count when from today or yesterday (UTC), else stale.
  const fresh = latest && Date.now() - latest.date.getTime() < 2 * DAY_MS ? latest : null;
  const hasActivity =
    fresh != null && (fresh.steps != null || fresh.activeCalories != null || fresh.activeMinutes != null);
  const device = await prisma.connectedDevice.findFirst({
    where: { userId, lastSyncAt: { not: null } },
    orderBy: { lastSyncAt: "desc" },
  });
  return {
    date: fresh?.date ?? null,
    activity: hasActivity
      ? { steps: fresh!.steps ?? null, activeCalories: fresh!.activeCalories ?? null, activeMinutes: fresh!.activeMinutes ?? null }
      : null,
    stress:
      fresh?.stressScore != null ? { score: fresh.stressScore, level: stressLevel(fresh.stressScore) } : null,
    insight: buildInsight(logs),
    device: device
      ? { id: device.id, name: device.name, provider: device.provider, status: device.status, lastSyncAt: device.lastSyncAt }
      : null,
  };
}
