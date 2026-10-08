import { prisma } from "../../db/prisma";
import {
  bmi,
  bmiBand,
  compareWeeks,
  detectWeightPlateau,
  goalProgress,
  leanMassKg,
  liftProgressByExercise,
  round1,
  strengthTrend,
  waistToHip,
  whrBand,
  type LiftSession,
} from "./progressMetrics";

/**
 * Body Composition (Figma Progress 02) and Insights (Progress 07). Everything
 * is derived from rows the user (or their connected device) actually logged.
 * Evidence labels: "measured" = typed by the user or ingested from a device;
 * "estimated" = derived here (lean mass, BMI, waist-hip ratio).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type Row = {
  weightKg: number | null;
  bodyFatPercent: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  source: string;
  deviceName: string | null;
  loggedAt: Date;
};

export const HEALTH_DISCLAIMER =
  "Fynrox provides general wellness and fitness guidance, not medical diagnosis or treatment. AI-generated insights are for information and planning only and should not replace advice from a qualified healthcare professional.";

export async function getBodyComposition(userId: string) {
  const [rows, profile, scales] = await Promise.all([
    prisma.bodyMeasurement.findMany({ where: { userId }, orderBy: { loggedAt: "asc" } }) as Promise<Row[]>,
    prisma.onboardingProfile.findUnique({ where: { userId }, select: { heightCm: true, gender: true } }),
    prisma.connectedDevice.findMany({ where: { userId, kind: "scale" }, orderBy: { lastSyncAt: "desc" } }) as Promise<
      Array<{ name: string; lastSyncAt: Date | null }>
    >,
  ]);

  const heightCm = (profile?.heightCm as number | null | undefined) ?? null;
  const gender = (profile?.gender as string | null | undefined) ?? null;

  const lastWith = (pick: (r: Row) => number | null): Row | null => {
    for (let i = rows.length - 1; i >= 0; i--) if (pick(rows[i]) != null) return rows[i];
    return null;
  };
  const weightAtOrBefore = (at: Date): number | null => {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].weightKg != null && rows[i].loggedAt.getTime() <= at.getTime()) return rows[i].weightKg;
    }
    return null;
  };

  const weightRow = lastWith((r) => r.weightKg);
  const fatRow = lastWith((r) => r.bodyFatPercent);
  const whrRow = [...rows].reverse().find((r) => r.waistCm != null && r.hipsCm != null) ?? null;

  const fatWeight = fatRow ? (fatRow.weightKg ?? weightAtOrBefore(fatRow.loggedAt)) : null;
  const lean = fatRow ? leanMassKg(fatWeight, fatRow.bodyFatPercent) : null;
  const bmiValue = bmi(weightRow?.weightKg ?? null, heightCm);
  const whrValue = whrRow ? waistToHip(whrRow.waistCm, whrRow.hipsCm) : null;

  const sixMonthsAgo = Date.now() - 183 * DAY_MS;
  const trend = rows
    .filter((r) => r.bodyFatPercent != null && r.loggedAt.getTime() >= sixMonthsAgo)
    .map((r) => ({
      at: r.loggedAt.toISOString(),
      bodyFatPercent: r.bodyFatPercent as number,
      leanMassKg: leanMassKg(r.weightKg ?? weightAtOrBefore(r.loggedAt), r.bodyFatPercent),
    }));

  // The Smart-scale card exists only when a scale is still connected AND it
  // has actually synced weight/body-fat rows (source "device").
  const deviceRow = [...rows].reverse().find((r) => r.source === "device" && (r.weightKg != null || r.bodyFatPercent != null));
  const scale =
    scales.length > 0 && deviceRow
      ? {
          deviceName: deviceRow.deviceName ?? scales[0].name,
          lastSyncAt: (scales[0].lastSyncAt ?? deviceRow.loggedAt).toISOString(),
          latestWeightKg: deviceRow.weightKg,
          latestBodyFatPercent: deviceRow.bodyFatPercent,
          measuredAt: deviceRow.loggedAt.toISOString(),
        }
      : null;

  return {
    heightCm,
    latest: {
      weightKg: weightRow ? { value: weightRow.weightKg as number, at: weightRow.loggedAt.toISOString(), evidence: "measured" as const } : null,
      bodyFatPercent: fatRow
        ? {
            value: fatRow.bodyFatPercent as number,
            at: fatRow.loggedAt.toISOString(),
            evidence: "measured" as const,
            source: fatRow.source,
          }
        : null,
      leanMassKg:
        lean != null && fatRow ? { value: lean, at: fatRow.loggedAt.toISOString(), evidence: "estimated" as const } : null,
      bmi:
        bmiValue != null && weightRow
          ? { value: bmiValue, band: bmiBand(bmiValue), at: weightRow.loggedAt.toISOString(), evidence: "estimated" as const }
          : null,
      waistToHip:
        whrValue != null && whrRow
          ? { value: whrValue, band: whrBand(whrValue, gender), at: whrRow.loggedAt.toISOString(), evidence: "estimated" as const }
          : null,
    },
    trend,
    scale,
  };
}

export type InsightKind = "goal" | "plateau" | "strength" | "recovery_tip" | "sleep";
export type InsightTone = "info" | "warning" | "positive";

export interface InsightCard {
  id: string;
  kind: InsightKind;
  tone: InsightTone;
  title: string;
  body: string;
  /** Short footer, e.g. "Based on recent trends". */
  footnote?: string;
}

/**
 * Rule-based insights - no model call, no invented numbers. A card is only
 * returned when its rule can be computed from real data:
 *  - goal: a goal weight AND >= 2 weight logs -> real progress sentence.
 *  - plateau: loss goal + >= 3 weekly weigh-ins within 0.3 kg (see detectWeightPlateau).
 *  - strength: a lift whose heaviest weight improved >= 2 times in 8 weeks (see strengthTrend).
 *  - sleep: >= 3 sleep values in each of the last 7 days and the 7 before; changes of >= 10% are called out.
 *  - recovery_tip: >= 3 soreness/energy self-reports in 7 days with avg soreness >= 4 (of 5) or avg energy <= 2.
 */
export async function getInsights(userId: string, now: Date = new Date()) {
  const since14 = new Date(now.getTime() - 14 * DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since28 = new Date(now.getTime() - 28 * DAY_MS);
  const [weights, profile, setRows, recovery, checkIns, sessions28] = await Promise.all([
    prisma.bodyMeasurement.findMany({ where: { userId, weightKg: { not: null } }, orderBy: { loggedAt: "asc" } }) as Promise<
      Array<{ weightKg: number; loggedAt: Date }>
    >,
    prisma.onboardingProfile.findUnique({ where: { userId }, select: { weightKg: true, targetWeightKg: true } }),
    prisma.exerciseSetLog.findMany({
      where: { session: { userId }, weightKg: { not: null } },
      include: { exercise: { select: { name: true } } },
      orderBy: { loggedAt: "asc" },
    }) as Promise<
      Array<{ exerciseId: string; sessionId: string; weightKg: number | null; reps: number; loggedAt: Date; exercise: { name: string } }>
    >,
    prisma.recoveryLog.findMany({
      where: { userId, date: { gte: since14 } },
      orderBy: { date: "asc" },
    }) as Promise<Array<{ date: Date; sleepHours: number | null; soreness: number | null; energyLevel: number | null }>>,
    prisma.checkIn.findMany({ where: { userId, createdAt: { gte: since7 } } }) as Promise<
      Array<{ energy: number; soreness: number }>
    >,
    prisma.workoutSession.count({ where: { userId, status: "completed", startedAt: { gte: since28 } } }),
  ]);

  const cards: InsightCard[] = [];
  const target = (profile?.targetWeightKg as number | null | undefined) ?? null;

  // Goal progress
  if (target != null && weights.length >= 2) {
    const start = { weightKg: weights[0].weightKg, at: weights[0].loggedAt };
    const gp = goalProgress(start, weights[weights.length - 1].weightKg, target);
    if (gp?.percent != null) {
      cards.push({
        id: "goal",
        kind: "goal",
        tone: "info",
        title: "Goal Progress",
        body: `Progress varies. Revisit your goals with a qualified professional rather than relying on a fixed prediction date. So far: ${gp.startWeightKg} kg to ${gp.currentWeightKg} kg, ${gp.percent}% of the way to ${gp.targetWeightKg} kg.`,
        footnote: "Based on recent trends",
      });
    }
  }

  // Plateau
  const plateau = detectWeightPlateau(
    weights.map((w) => ({ weightKg: w.weightKg, loggedAt: w.loggedAt })),
    target,
    now,
  );
  if (plateau) {
    cards.push({
      id: "plateau",
      kind: "plateau",
      tone: "warning",
      title: "Weight Loss Plateau Warning",
      body: `Your weight has stayed within ${plateau.rangeKg} kg across ${plateau.weeks} weekly weigh-ins (around ${plateau.weightKg} kg). Avoid drastic calorie cuts. Review your intake and activity with a qualified professional, especially if you are under 18, pregnant, or have an eating-disorder history.`,
    });
  }

  // Strength
  const lifts: LiftSession[] = setRows
    .filter((s) => s.weightKg != null)
    .map((s) => ({
      exerciseId: s.exerciseId,
      exerciseName: s.exercise.name,
      at: s.loggedAt,
      weightKg: s.weightKg as number,
      reps: s.reps,
      sessionId: s.sessionId,
    }));
  const trend = strengthTrend(liftProgressByExercise(lifts), now);
  if (trend) {
    cards.push({
      id: "strength",
      kind: "strength",
      tone: "positive",
      title: "Strength Progress",
      body: `${trend.exerciseName} trending upward. Your heaviest set moved from ${trend.fromKg} kg to ${trend.toKg} kg across ${trend.improvements} personal records over ${trend.weeks} week${trend.weeks === 1 ? "" : "s"}. Keep up the consistency.`,
    });
  }

  // Sleep
  const sleep = compareWeeks(
    recovery.filter((r) => r.sleepHours != null).map((r) => ({ at: r.date, value: r.sleepHours as number })),
    now,
  );
  if (sleep && Math.abs(sleep.changePercent) >= 10) {
    const down = sleep.changePercent < 0;
    cards.push({
      id: "sleep",
      kind: "sleep",
      tone: down ? "warning" : "positive",
      title: "Sleep Insight",
      body: down
        ? `Average sleep dipped ${Math.abs(sleep.changePercent)}% this week (${sleep.recentAvg} h per night vs ${sleep.previousAvg} h the week before). Try reducing screen time before bed to improve sleep quality.`
        : `Average sleep rose ${sleep.changePercent}% this week (${sleep.recentAvg} h per night vs ${sleep.previousAvg} h the week before).`,
    });
  }

  // Recovery tip: soreness 1-5 (5 = very sore) and energy 1-5, from recovery logs + check-ins in the last 7 days.
  const sore: number[] = [];
  const energy: number[] = [];
  for (const r of recovery) {
    if (r.date.getTime() < since7.getTime()) continue;
    if (r.soreness != null) sore.push(r.soreness);
    if (r.energyLevel != null) energy.push(r.energyLevel);
  }
  for (const c of checkIns) {
    sore.push(c.soreness);
    energy.push(c.energy);
  }
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const highSoreness = sore.length >= 3 && avg(sore) >= 4;
  const lowEnergy = energy.length >= 3 && avg(energy) <= 2;
  if (highSoreness || lowEnergy) {
    const parts: string[] = [];
    if (highSoreness) parts.push(`soreness has averaged ${round1(avg(sore))} out of 5`);
    if (lowEnergy) parts.push(`energy has averaged ${round1(avg(energy))} out of 5`);
    cards.push({
      id: "recovery_tip",
      kind: "recovery_tip",
      tone: "info",
      title: "Recovery Tip",
      body: `Consider a lighter week. Over the last 7 days your ${parts.join(" and ")}, and you completed ${sessions28} workout${sessions28 === 1 ? "" : "s"} in the last 4 weeks. A lighter week may help your body recover and come back stronger.`,
    });
  }

  return { cards, disclaimer: HEALTH_DISCLAIMER };
}
