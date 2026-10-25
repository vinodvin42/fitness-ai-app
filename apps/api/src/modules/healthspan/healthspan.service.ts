import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { decryptField, encryptField } from "../../lib/fieldCrypto";
import { getDecryptedOnboardingProfile } from "../../lib/healthData";
import { effectiveAge } from "../../lib/age";
import {
  estimateVo2max,
  fitnessAge,
  framinghamRisk,
  heartAge,
  heartAgeDrivers,
  HEART_AGE_VALID_AGES,
  paIndex,
  whoBand,
  whoSouthAsiaRisk,
  WHO_VALID_AGES,
  type ActivityAnswers,
  type Sex,
} from "./healthspan.math";
import type { HealthReadingInput, HealthspanAnswersInput } from "./healthspan.schema";

/**
 * Healthspan (owner, 25 Oct 2026, phases 1 and 2): fitness age, heart age,
 * blood-pressure and VO2max readings, and 12-month trends. The formulas and
 * their sources are in ./healthspan.math.ts. Every value is computed from
 * the member's own data; anything missing is named in `missing` so the app
 * can ask for it instead of guessing. Smoking, blood-pressure medicine and
 * activity answers are health data and are stored encrypted
 * (OnboardingProfile.healthspanEnc, lib/fieldCrypto.ts).
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface HealthspanAnswers {
  smoking?: "never" | "former" | "current";
  bpMedication?: boolean;
  activity?: ActivityAnswers;
}

function readAnswers(enc: string | null | undefined): HealthspanAnswers {
  if (!enc) return {};
  try {
    return JSON.parse(decryptField(enc)) as HealthspanAnswers;
  } catch {
    return {};
  }
}

export async function getAnswers(userId: string): Promise<HealthspanAnswers> {
  const row = await prisma.onboardingProfile.findUnique({ where: { userId }, select: { healthspanEnc: true } });
  return readAnswers(row?.healthspanEnc);
}

export async function updateAnswers(userId: string, input: HealthspanAnswersInput): Promise<HealthspanAnswers> {
  const merged: HealthspanAnswers = { ...(await getAnswers(userId)), ...input } as HealthspanAnswers;
  const healthspanEnc = encryptField(JSON.stringify(merged));
  await prisma.onboardingProfile.upsert({ where: { userId }, create: { userId, healthspanEnc }, update: { healthspanEnc } });
  return merged;
}

type ReadingRow = {
  id: string;
  kind: string;
  systolic: number | null;
  diastolic: number | null;
  vo2max: number | null;
  measuredAt: Date;
  source: string;
  deviceName: string | null;
};

function toReading(r: ReadingRow) {
  return {
    id: r.id,
    kind: r.kind as "blood_pressure" | "vo2max",
    systolic: r.systolic,
    diastolic: r.diastolic,
    vo2max: r.vo2max,
    measuredAt: r.measuredAt.toISOString(),
    source: r.source as "manual" | "device",
    deviceName: r.deviceName,
  };
}

export async function listReadings(userId: string, kind: "blood_pressure" | "vo2max") {
  const rows = (await prisma.healthReading.findMany({ where: { userId, kind }, orderBy: { measuredAt: "desc" }, take: 50 })) as ReadingRow[];
  return { items: rows.map(toReading) };
}

export async function addReading(userId: string, input: HealthReadingInput, now: Date = new Date()) {
  const measuredAt = input.measuredAt ? new Date(input.measuredAt) : now;
  if (measuredAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw new ApiHttpError(400, "reading_in_future", "A reading can't be in the future");
  }
  const row = (await prisma.healthReading.create({
    data:
      input.kind === "blood_pressure"
        ? { userId, kind: "blood_pressure", systolic: input.systolic, diastolic: input.diastolic, measuredAt, source: "manual" }
        : { userId, kind: "vo2max", vo2max: input.vo2max, measuredAt, source: "manual" },
  })) as ReadingRow;
  return toReading(row);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export type FitnessMissing = "age" | "sex" | "waist" | "resting_hr" | "activity";
export type HeartMissing = "age" | "sex" | "blood_pressure" | "height_weight" | "smoking" | "bp_medication" | "health_answers";

/** GET /healthspan - fitness age and heart age with what they're based on. */
export async function getHealthspan(userId: string, now: Date = new Date()) {
  const profile = await getDecryptedOnboardingProfile(userId);
  const answers = await getAnswers(userId);
  const age = profile ? effectiveAge(profile, now) : null;
  const sex: Sex | null = profile?.gender === "male" || profile?.gender === "female" ? profile.gender : null;
  const yearAgo = new Date(now.getTime() - 365 * DAY_MS);

  const [waistRow, weightRow, rhrLogs, vo2Row, bpRows] = await Promise.all([
    prisma.bodyMeasurement.findFirst({ where: { userId, waistCm: { not: null } }, orderBy: { loggedAt: "desc" } }),
    prisma.bodyMeasurement.findFirst({ where: { userId, weightKg: { not: null } }, orderBy: { loggedAt: "desc" } }),
    prisma.recoveryLog.findMany({
      where: { userId, restingHeartRate: { not: null }, date: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      orderBy: { date: "desc" },
      take: 14,
    }),
    prisma.healthReading.findFirst({ where: { userId, kind: "vo2max", measuredAt: { gte: yearAgo } }, orderBy: { measuredAt: "desc" } }),
    prisma.healthReading.findMany({ where: { userId, kind: "blood_pressure", measuredAt: { gte: yearAgo } }, orderBy: { measuredAt: "desc" }, take: 20 }),
  ]);

  // ---- Fitness age ----
  const waistCm = (waistRow?.waistCm as number | null | undefined) ?? null;
  const restingHr = rhrLogs.length ? Math.round(mean(rhrLogs.map((l) => l.restingHeartRate as number))) : null;
  const pa = answers.activity ? paIndex(answers.activity) : null;
  const fitnessMissing: FitnessMissing[] = [];
  if (age == null) fitnessMissing.push("age");
  if (!sex) fitnessMissing.push("sex");
  let vo2max: number | null = null;
  let vo2Source: "measured" | "estimated" | null = null;
  if (vo2Row?.vo2max != null) {
    vo2max = vo2Row.vo2max;
    vo2Source = "measured";
  } else {
    if (waistCm == null) fitnessMissing.push("waist");
    if (restingHr == null) fitnessMissing.push("resting_hr");
    if (pa == null) fitnessMissing.push("activity");
    if (fitnessMissing.length === 0 && sex && age != null && waistCm != null && restingHr != null && pa != null) {
      vo2max = estimateVo2max({ sex, age, waistCm, restingHr, paIndex: pa });
      vo2Source = "estimated";
    }
  }
  const fitnessInRange = age == null || (age >= 20 && age <= 90);
  const fit = vo2max != null && sex && age != null && fitnessInRange ? fitnessAge(sex, vo2max) : null;

  // ---- Heart age ----
  const latestBp = bpRows[0] ?? null;
  // The readings in the 30 days up to the latest one (at most 5), averaged: one reading moves a lot.
  const recentBp = latestBp
    ? bpRows.filter((r) => latestBp.measuredAt.getTime() - r.measuredAt.getTime() <= 30 * DAY_MS).slice(0, 5)
    : [];
  const systolic = recentBp.length ? Math.round(mean(recentBp.map((r) => r.systolic as number))) : null;
  const diastolic = recentBp.length ? Math.round(mean(recentBp.map((r) => r.diastolic as number))) : null;
  const weightKg = (weightRow?.weightKg as number | null | undefined) ?? profile?.weightKg ?? null;
  const heightCm = profile?.heightCm ?? null;
  const bmi = weightKg != null && heightCm ? weightKg / Math.pow(heightCm / 100, 2) : null;
  const conditions = (profile?.medicalConditions ?? []).map((c) => c.toLowerCase());
  const answeredConditions = conditions.length > 0 && !conditions.includes("prefer not to say");
  const diabetes = answeredConditions ? conditions.includes("diabetes") : null;
  const heartMissing: HeartMissing[] = [];
  if (age == null) heartMissing.push("age");
  if (!sex) heartMissing.push("sex");
  if (systolic == null) heartMissing.push("blood_pressure");
  if (bmi == null) heartMissing.push("height_weight");
  if (answers.smoking == null) heartMissing.push("smoking");
  if (answers.bpMedication == null) heartMissing.push("bp_medication");
  if (diabetes == null) heartMissing.push("health_answers");
  const heartInRange = age == null || (age >= HEART_AGE_VALID_AGES.min && age <= HEART_AGE_VALID_AGES.max);
  let heart: { heartAge: number; riskPct: number; drivers: ReturnType<typeof heartAgeDrivers> } | null = null;
  if (heartMissing.length === 0 && heartInRange && sex && age != null && systolic != null && bmi != null && diabetes != null) {
    const inputs = { sex, age, bmi, sbp: systolic, bpTreated: !!answers.bpMedication, smoker: answers.smoking === "current", diabetes };
    heart = { heartAge: heartAge(inputs), riskPct: framinghamRisk(inputs) * 100, drivers: heartAgeDrivers(inputs) };
  }

  // WHO 2019 South Asia 10-year risk: needs age, sex, blood pressure, BMI and smoking (no medicine or diabetes term).
  const whoMissing = heartMissing.filter((m) => m === "age" || m === "sex" || m === "blood_pressure" || m === "height_weight" || m === "smoking");
  const whoInRange = age == null || (age >= WHO_VALID_AGES.min && age <= WHO_VALID_AGES.max);
  const whoRisk =
    whoMissing.length === 0 && whoInRange && sex && age != null && systolic != null && bmi != null && answers.smoking != null
      ? whoSouthAsiaRisk({ sex, age, sbp: systolic, bmi, smoker: answers.smoking === "current" }).cvd * 100
      : null;

  return {
    age,
    sex,
    fitness: {
      status: fit ? "ready" : !fitnessInRange ? "out_of_range" : "missing",
      vo2max: vo2max != null ? round1(vo2max) : null,
      vo2Source,
      vo2At: vo2Source === "measured" && vo2Row ? vo2Row.measuredAt.toISOString() : null,
      fitnessAge: fit ? Math.round(fit.age) : null,
      bound: fit?.bound ?? null,
      inputs: { waistCm, restingHr, paIndex: pa != null ? round1(pa) : null },
      missing: fitnessMissing,
    },
    heart: {
      status: heart ? "ready" : !heartInRange ? "out_of_range" : "missing",
      heartAge: heart ? Math.round(heart.heartAge) : null,
      riskPct: heart ? round1(heart.riskPct) : null,
      drivers: heart?.drivers ?? [],
      inputs: {
        systolic,
        diastolic,
        bpAt: latestBp ? latestBp.measuredAt.toISOString() : null,
        bpReadings: recentBp.length,
        bmi: bmi != null ? round1(bmi) : null,
        smoker: answers.smoking != null ? answers.smoking === "current" : null,
        bpTreated: answers.bpMedication ?? null,
        diabetes,
      },
      missing: heartMissing,
    },
    risk: {
      status: whoRisk != null ? "ready" : !whoInRange ? "out_of_range" : "missing",
      model: "who_2019_south_asia" as const,
      riskPct: whoRisk != null ? round1(whoRisk) : null,
      band: whoRisk != null ? whoBand(whoRisk) : null,
      diabetesNotIncluded: diabetes === true,
      missing: whoMissing,
    },
    answers,
  };
}

/** GET /healthspan/trends?months=12 - monthly averages, oldest month first; null where nothing was logged. */
export async function getLongTermTrends(userId: string, months: number, now: Date = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const [logs, measures, readings] = await Promise.all([
    prisma.recoveryLog.findMany({ where: { userId, date: { gte: start } } }),
    prisma.bodyMeasurement.findMany({ where: { userId, loggedAt: { gte: start } } }),
    prisma.healthReading.findMany({ where: { userId, measuredAt: { gte: start } } }),
  ]);
  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const buckets = new Map<string, Record<string, number[]>>();
  const add = (month: string, field: string, v: number | null | undefined) => {
    if (v == null) return;
    const b = buckets.get(month) ?? {};
    (b[field] ??= []).push(v);
    buckets.set(month, b);
  };
  for (const l of logs) {
    const m = key(l.date);
    add(m, "restingHr", l.restingHeartRate);
    add(m, "hrvMs", l.hrvMs);
    add(m, "sleepHours", l.sleepHours);
    add(m, "steps", l.steps);
  }
  for (const b of measures) {
    const m = key(b.loggedAt);
    add(m, "weightKg", b.weightKg);
    add(m, "waistCm", b.waistCm);
  }
  for (const r of readings) {
    const m = key(r.measuredAt);
    add(m, "systolic", r.systolic);
    add(m, "diastolic", r.diastolic);
    add(m, "vo2max", r.vo2max);
  }
  const fields = ["weightKg", "waistCm", "restingHr", "hrvMs", "sleepHours", "steps", "systolic", "diastolic", "vo2max"] as const;
  const items = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const b = buckets.get(key(d)) ?? {};
    const row: Record<string, number | string | null> = { month: key(d) };
    for (const f of fields) row[f] = b[f]?.length ? (f === "steps" ? Math.round(mean(b[f])) : round1(mean(b[f]))) : null;
    items.push(row);
  }
  return { months, items };
}
