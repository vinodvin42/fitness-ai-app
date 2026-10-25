import { Linking, Platform } from "react-native";
import type { ConnectedDevice, DeviceSyncResult, DeviceSyncSample } from "@fitness-ai-app/types";
import * as HealthConnectSdk from "react-native-health-connect";
import { fetchDevices, pairDevice, syncDevice } from "../api/devices";

/**
 * Health Connect on Android (owner, 24 Oct 2026: "Wearables: Health Connect
 * (Android)"; Figma settings/08). The phone's Health Connect store already
 * holds what watches, bands, rings and scales write to it (Samsung Health,
 * Fitbit, Mi Fitness, Noise, boAt and so on), so reading it covers most
 * wearables without a vendor SDK.
 *
 * Flow: ask for read access to the seven record types below, pair one
 * "Health Connect" device with the API once (POST /devices), then post one
 * sample per day (POST /devices/:id/sync, devices.schema.ts syncSampleSchema).
 * The API keeps only the values the device's permissions allow and merges them
 * into that day's recovery log.
 *
 * Android only: iOS and web get "unsupported" and never call the native
 * module. The day mapping is pure and checked by tests/healthConnect.check.cjs.
 *
 * Sleep detail (owner, 25 Oct 2026): each night also sends its bed and wake
 * times, time in bed and, when the watch or app recorded stages, minutes
 * awake / light / deep / REM. Hours slept are then time in bed minus awake.
 */

/** The record types Fynrox reads, in the order the permission sheet lists them. */
export const HEALTH_CONNECT_RECORDS = [
  "Steps",
  "ActiveCaloriesBurned",
  "RestingHeartRate",
  "HeartRateVariabilityRmssd",
  "SleepSession",
  "OxygenSaturation",
  "Weight",
  // Healthspan (25 Oct 2026): heart age and fitness age.
  "BloodPressure",
  "Vo2Max",
] as const;
export type HealthConnectRecord = (typeof HEALTH_CONNECT_RECORDS)[number];

export const HEALTH_CONNECT_RECORD_LABEL: Record<HealthConnectRecord, string> = {
  Steps: "Steps",
  ActiveCaloriesBurned: "Active calories",
  RestingHeartRate: "Resting heart rate",
  HeartRateVariabilityRmssd: "Heart-rate variability",
  SleepSession: "Sleep",
  OxygenSaturation: "Blood oxygen",
  Weight: "Weight",
  BloodPressure: "Blood pressure",
  Vo2Max: "VO2 max",
};

export const HEALTH_CONNECT_DEVICE = { provider: "health_connect", name: "Health Connect", kind: "other" } as const;

/** The first sync backfills a month; later ones refresh the last week (late watch uploads land within days). */
export const FIRST_SYNC_DAYS = 30;
export const REPEAT_SYNC_DAYS = 7;

export type HealthConnectStatus =
  /** iOS, web, or a build without the native module. */
  | "unsupported"
  /** Android, but Health Connect can't run on this phone. */
  | "unavailable"
  /** Health Connect needs installing or updating from the Play Store. */
  | "update_required"
  | "available";

/** SdkAvailabilityStatus (1 unavailable, 2 provider update required, 3 available) to our status. */
export function statusFromSdk(code: number): HealthConnectStatus {
  if (code === 3) return "available";
  if (code === 2) return "update_required";
  return "unavailable";
}

// ---- Pure day mapping (tests/healthConnect.check.cjs) ----------------------

export interface DayWindow {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Local midnight that starts the day, as an ISO instant. */
  start: string;
  /** The next local midnight. */
  end: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD of an instant in the phone's time zone. */
export function localDay(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The last `n` local days, oldest first, ending with today. */
export function lastDays(n: number, now: Date = new Date()): DayWindow[] {
  const count = Math.max(1, Math.min(90, Math.floor(n)));
  const out: DayWindow[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
    out.push({ date: localDay(start), start: start.toISOString(), end: end.toISOString() });
  }
  return out;
}

/** What the native reader returns; everything is optional because each type needs its own permission. */
export interface HealthConnectRaw {
  /** Day → total steps (Health Connect's aggregate, which removes overlaps between apps). Days without data are absent. */
  steps?: Record<string, number>;
  /** Day → active kcal (aggregate). */
  activeCalories?: Record<string, number>;
  restingHr?: Array<{ time: string; bpm: number }>;
  hrv?: Array<{ time: string; ms: number }>;
  sleep?: SleepSessionRaw[];
  spo2?: Array<{ time: string; percent: number }>;
  weight?: Array<{ time: string; kg: number }>;
  bloodPressure?: Array<{ time: string; systolic: number; diastolic: number }>;
  vo2max?: Array<{ time: string; value: number }>;
}

function meanByDay<T extends { time: string }>(rows: T[] | undefined, value: (r: T) => number): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const r of rows ?? []) {
    const v = value(r);
    if (!Number.isFinite(v)) continue;
    const day = localDay(r.time);
    const s = sums.get(day) ?? { total: 0, count: 0 };
    s.total += v;
    s.count += 1;
    sums.set(day, s);
  }
  return new Map([...sums].map(([day, s]) => [day, s.total / s.count]));
}

/** Health Connect SleepSessionRecord stage codes (SleepStageType; 7 is "awake in bed" on newer Android). */
export const SLEEP_STAGE = { UNKNOWN: 0, AWAKE: 1, SLEEPING: 2, OUT_OF_BED: 3, LIGHT: 4, DEEP: 5, REM: 6, AWAKE_IN_BED: 7 } as const;
const AWAKE_STAGES = new Set<number>([SLEEP_STAGE.AWAKE, SLEEP_STAGE.OUT_OF_BED, SLEEP_STAGE.AWAKE_IN_BED]);

export interface SleepSessionRaw {
  startTime: string;
  endTime: string;
  stages?: Array<{ startTime: string; endTime: string; stage: number }>;
}

export interface SleepNight {
  /** Bedtime and wake time of the night's longest stretch (ISO). */
  start: string;
  end: string;
  /** All sleep sessions that ended on this day, overlaps merged. */
  inBedMin: number;
  /** Time in bed minus awake stages (or time in bed when no stages were recorded). */
  asleepHours: number;
  /** Only when the source recorded stages. */
  awakeMin?: number;
  lightMin?: number;
  deepMin?: number;
  remMin?: number;
}

/**
 * One night per day. A night counts on the day you woke up (its end time).
 * Overlapping sessions (the same night written by a watch app and a phone app)
 * are merged first, so a night is never counted twice; stages come from the
 * one session in the overlap that recorded the most staged time, for the same
 * reason. A nap adds to the day's time in bed but not to its bed/wake times.
 */
export function sleepNightsByWakeDay(sessions: SleepSessionRaw[] | undefined): Map<string, SleepNight> {
  const parsed = (sessions ?? [])
    .map((s) => {
      const start = Date.parse(s.startTime);
      const end = Date.parse(s.endTime);
      const stages = (s.stages ?? [])
        .map((st) => ({ start: Math.max(start, Date.parse(st.startTime)), end: Math.min(end, Date.parse(st.endTime)), stage: st.stage }))
        .filter((st) => Number.isFinite(st.start) && Number.isFinite(st.end) && st.end > st.start);
      return { start, end, stages };
    })
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const groups: Array<{ start: number; end: number; members: typeof parsed }> = [];
  for (const s of parsed) {
    const last = groups[groups.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      last.members.push(s);
    } else groups.push({ start: s.start, end: s.end, members: [s] });
  }
  const minutes = (a: number, b: number) => (b - a) / 60_000;
  const days = new Map<string, { inBed: number; awake: number; light: number; deep: number; rem: number; staged: boolean; main: { start: number; end: number } }>();
  for (const g of groups) {
    const day = localDay(new Date(g.end));
    const best = g.members
      .map((m) => ({ m, staged: m.stages.reduce((sum, st) => sum + (st.end - st.start), 0) }))
      .sort((a, b) => b.staged - a.staged)[0];
    const cur = days.get(day) ?? { inBed: 0, awake: 0, light: 0, deep: 0, rem: 0, staged: false, main: { start: g.start, end: g.end } };
    cur.inBed += minutes(g.start, g.end);
    if (best && best.staged > 0) {
      cur.staged = true;
      for (const st of best.m.stages) {
        const min = minutes(st.start, st.end);
        if (AWAKE_STAGES.has(st.stage)) cur.awake += min;
        else if (st.stage === SLEEP_STAGE.LIGHT) cur.light += min;
        else if (st.stage === SLEEP_STAGE.DEEP) cur.deep += min;
        else if (st.stage === SLEEP_STAGE.REM) cur.rem += min;
      }
    }
    if (g.end - g.start > cur.main.end - cur.main.start) cur.main = { start: g.start, end: g.end };
    days.set(day, cur);
  }
  return new Map(
    [...days].map(([day, n]) => [
      day,
      {
        start: new Date(n.main.start).toISOString(),
        end: new Date(n.main.end).toISOString(),
        inBedMin: n.inBed,
        asleepHours: Math.max(0, n.inBed - n.awake) / 60,
        ...(n.staged ? { awakeMin: n.awake, lightMin: n.light, deepMin: n.deep, remMin: n.rem } : {}),
      },
    ]),
  );
}

/** Hours slept per day (see sleepNightsByWakeDay). */
export function sleepHoursByWakeDay(sessions: SleepSessionRaw[] | undefined): Map<string, number> {
  return new Map([...sleepNightsByWakeDay(sessions)].map(([day, n]) => [day, n.asleepHours]));
}

/** The latest reading of each day. */
function latestByDay<T extends { time: string }>(rows: T[] | undefined, value: (r: T) => number): Map<string, number> {
  const latest = new Map<string, { at: number; v: number }>();
  for (const r of rows ?? []) {
    const v = value(r);
    const at = Date.parse(r.time);
    if (!Number.isFinite(v) || !Number.isFinite(at)) continue;
    const day = localDay(r.time);
    const cur = latest.get(day);
    if (!cur || at > cur.at) latest.set(day, { at, v });
  }
  return new Map([...latest].map(([day, x]) => [day, x.v]));
}

/** A whole number inside the API's range, else undefined (an out-of-range value would fail the whole sync). */
function intIn(v: number | undefined, min: number, max: number): number | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  const r = Math.round(v);
  return r >= min && r <= max ? r : undefined;
}
function decimalIn(v: number | undefined, min: number, max: number, places: number): number | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  const f = 10 ** places;
  const r = Math.round(v * f) / f;
  return r >= min && r <= max ? r : undefined;
}

/**
 * One sample per day for POST /devices/:id/sync, using the ranges in
 * syncSampleSchema. Days with nothing to send are left out.
 */
export function buildSyncSamples(days: string[], raw: HealthConnectRaw): DeviceSyncSample[] {
  const restingHr = meanByDay(raw.restingHr, (r) => r.bpm);
  const hrv = meanByDay(raw.hrv, (r) => r.ms);
  const spo2 = meanByDay(raw.spo2, (r) => r.percent);
  const nights = sleepNightsByWakeDay(raw.sleep);
  const weight = latestByDay(raw.weight, (r) => r.kg);
  // The day's latest blood-pressure reading, as one pair (never mixing two readings).
  const bpByDay = new Map<string, { at: number; systolic: number; diastolic: number }>();
  for (const r of raw.bloodPressure ?? []) {
    const at = Date.parse(r.time);
    if (!Number.isFinite(at)) continue;
    const day = localDay(r.time);
    const cur = bpByDay.get(day);
    if (!cur || at > cur.at) bpByDay.set(day, { at, systolic: r.systolic, diastolic: r.diastolic });
  }
  const vo2 = latestByDay(raw.vo2max, (r) => r.value);
  const samples: DeviceSyncSample[] = [];
  for (const date of [...new Set(days)].sort()) {
    // A night longer than a day is a bad record: none of it is sent.
    const found = nights.get(date);
    const night = found && found.inBedMin <= 1440 ? found : undefined;
    const fields: Omit<DeviceSyncSample, "date"> = {
      steps: intIn(raw.steps?.[date], 0, 200_000),
      activeCalories: intIn(raw.activeCalories?.[date], 0, 20_000),
      restingHr: intIn(restingHr.get(date), 20, 220),
      hrvMs: intIn(hrv.get(date), 0, 400),
      sleepHours: decimalIn(night?.asleepHours, 0, 24, 2),
      sleepStart: night?.start,
      sleepEnd: night?.end,
      sleepInBedMin: intIn(night?.inBedMin, 0, 1440),
      sleepAwakeMin: intIn(night?.awakeMin, 0, 1440),
      sleepLightMin: intIn(night?.lightMin, 0, 1440),
      sleepDeepMin: intIn(night?.deepMin, 0, 1440),
      sleepRemMin: intIn(night?.remMin, 0, 1440),
      spo2: intIn(spo2.get(date), 50, 100),
      // The API stores weight only from devices paired as a scale; it's sent so that can change without an app update.
      weightKg: decimalIn(weight.get(date), 0.1, 500, 1),
    };
    const bp = bpByDay.get(date);
    const systolic = intIn(bp?.systolic, 70, 260);
    const diastolic = intIn(bp?.diastolic, 40, 160);
    if (systolic != null && diastolic != null && systolic > diastolic) {
      fields.systolicBp = systolic;
      fields.diastolicBp = diastolic;
    }
    fields.vo2max = decimalIn(vo2.get(date), 10, 90, 1);
    const kept = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (Object.keys(kept).length > 0) samples.push({ date, ...kept });
  }
  return samples;
}

// ---- Native calls (Android only) -------------------------------------------

type Sdk = typeof HealthConnectSdk;

function sdk(): Sdk | null {
  return Platform.OS === "android" ? HealthConnectSdk : null;
}

export async function getHealthConnectStatus(): Promise<HealthConnectStatus> {
  const hc = sdk();
  if (!hc) return "unsupported";
  try {
    return statusFromSdk(await hc.getSdkStatus());
  } catch {
    return "unsupported";
  }
}

let initialized: Promise<boolean> | null = null;
async function ready(): Promise<Sdk> {
  const hc = sdk();
  if (!hc) throw new Error("Health Connect is only on Android.");
  initialized ??= hc.initialize().catch((e) => {
    initialized = null;
    throw e;
  });
  if (!(await initialized)) {
    initialized = null;
    throw new Error("Health Connect couldn't start on this phone.");
  }
  return hc;
}

function grantedFrom(perms: Array<{ accessType: string; recordType: string }>): HealthConnectRecord[] {
  const read = new Set(perms.filter((p) => p.accessType === "read").map((p) => p.recordType));
  return HEALTH_CONNECT_RECORDS.filter((r) => read.has(r));
}

/** Opens Health Connect's own permission sheet; resolves with what the member allowed. */
export async function requestHealthConnectPermissions(): Promise<HealthConnectRecord[]> {
  const hc = await ready();
  const granted = await hc.requestPermission(HEALTH_CONNECT_RECORDS.map((recordType) => ({ accessType: "read" as const, recordType })));
  return grantedFrom(granted);
}

/** The record types Fynrox may read right now (the member can change this in Health Connect at any time). */
export async function getGrantedHealthConnectRecords(): Promise<HealthConnectRecord[]> {
  if ((await getHealthConnectStatus()) !== "available") return [];
  const hc = await ready();
  return grantedFrom(await hc.getGrantedPermissions());
}

/** Withdraws every Health Connect permission Fynrox holds. */
export async function revokeHealthConnectPermissions(): Promise<void> {
  const hc = await ready();
  await hc.revokeAllPermissions();
}

export function openHealthConnectSettings(): void {
  sdk()?.openHealthConnectSettings();
}

/** Play Store page for installing or updating Health Connect (Android 9–13). */
export function openHealthConnectInstall(): Promise<void> {
  return Linking.openURL("market://details?id=com.google.android.apps.healthdata").catch(() =>
    Linking.openURL("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"),
  );
}

/** Every page of a readRecords call (busy watches write many SpO2 / HRV points a night). */
async function readAll<T extends HealthConnectRecord>(hc: Sdk, type: T, window: { start: string; end: string }) {
  const rows: Array<HealthConnectSdk.RecordResult<T>> = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await hc.readRecords(type, {
      timeRangeFilter: { operator: "between", startTime: window.start, endTime: window.end },
      pageSize: 1000,
      ...(pageToken ? { pageToken } : {}),
    });
    rows.push(...res.records);
    pageToken = res.pageToken || undefined;
    if (!pageToken) break;
  }
  return rows;
}

/** Reads the allowed record types for the given days. Types without permission are skipped. */
export async function readHealthConnectDays(days: DayWindow[], granted: HealthConnectRecord[]): Promise<HealthConnectRaw> {
  const hc = await ready();
  const allowed = new Set(granted);
  const all = { start: days[0].start, end: days[days.length - 1].end };
  const raw: HealthConnectRaw = {};
  const perDay = async (pick: (day: DayWindow) => Promise<number | null>) => {
    const out: Record<string, number> = {};
    for (const day of days) {
      const v = await pick(day);
      if (v != null) out[day.date] = v;
    }
    return out;
  };
  const range = (day: DayWindow) => ({ operator: "between" as const, startTime: day.start, endTime: day.end });

  if (allowed.has("Steps")) {
    raw.steps = await perDay(async (day) => {
      const r = await hc.aggregateRecord({ recordType: "Steps", timeRangeFilter: range(day) });
      return r.dataOrigins.length ? r.COUNT_TOTAL : null;
    });
  }
  if (allowed.has("ActiveCaloriesBurned")) {
    raw.activeCalories = await perDay(async (day) => {
      const r = await hc.aggregateRecord({ recordType: "ActiveCaloriesBurned", timeRangeFilter: range(day) });
      return r.dataOrigins.length ? r.ACTIVE_CALORIES_TOTAL.inKilocalories : null;
    });
  }
  if (allowed.has("RestingHeartRate")) {
    raw.restingHr = (await readAll(hc, "RestingHeartRate", all)).map((r) => ({ time: r.time, bpm: r.beatsPerMinute }));
  }
  if (allowed.has("HeartRateVariabilityRmssd")) {
    raw.hrv = (await readAll(hc, "HeartRateVariabilityRmssd", all)).map((r) => ({ time: r.time, ms: r.heartRateVariabilityMillis }));
  }
  if (allowed.has("SleepSession")) {
    // A night that ends on the first day started the evening before.
    const sleepWindow = { start: new Date(Date.parse(all.start) - 18 * 3_600_000).toISOString(), end: all.end };
    raw.sleep = (await readAll(hc, "SleepSession", sleepWindow)).map((r) => ({
      startTime: r.startTime,
      endTime: r.endTime,
      stages: (r.stages ?? []).map((st) => ({ startTime: st.startTime, endTime: st.endTime, stage: st.stage })),
    }));
  }
  if (allowed.has("OxygenSaturation")) {
    raw.spo2 = (await readAll(hc, "OxygenSaturation", all)).map((r) => ({ time: r.time, percent: r.percentage }));
  }
  if (allowed.has("Weight")) {
    raw.weight = (await readAll(hc, "Weight", all)).map((r) => ({ time: r.time, kg: r.weight.inKilograms }));
  }
  if (allowed.has("BloodPressure")) {
    raw.bloodPressure = (await readAll(hc, "BloodPressure", all)).map((r) => ({
      time: r.time,
      systolic: r.systolic.inMillimetersOfMercury,
      diastolic: r.diastolic.inMillimetersOfMercury,
    }));
  }
  if (allowed.has("Vo2Max")) {
    raw.vo2max = (await readAll(hc, "Vo2Max", all)).map((r) => ({ time: r.time, value: r.vo2MillilitersPerMinuteKilogram }));
  }
  return raw;
}

// ---- Pairing and sync with the API -----------------------------------------

export function findHealthConnectDevice(devices: ConnectedDevice[]): ConnectedDevice | undefined {
  return devices.find((d) => d.provider === HEALTH_CONNECT_DEVICE.provider && d.name === HEALTH_CONNECT_DEVICE.name);
}

/** The member's "Health Connect" device, paired on first use. */
export async function ensureHealthConnectDevice(): Promise<ConnectedDevice> {
  const existing = findHealthConnectDevice(await fetchDevices());
  if (existing) return existing;
  return pairDevice({ ...HEALTH_CONNECT_DEVICE });
}

export interface HealthConnectSyncOutcome {
  result: DeviceSyncResult;
  /** Days that had something to send. */
  days: number;
}

/**
 * Reads Health Connect and posts it. A read failure (for example permission
 * withdrawn in Health Connect) is reported to the API as the device's sync
 * error, so Connected devices shows it, and then rethrown.
 */
export async function syncHealthConnect(options: { days?: number } = {}): Promise<HealthConnectSyncOutcome> {
  const device = await ensureHealthConnectDevice();
  let samples: DeviceSyncSample[];
  try {
    const granted = await getGrantedHealthConnectRecords();
    if (granted.length === 0) throw new Error("Fynrox has no Health Connect permissions. Turn them on in Health Connect.");
    const windows = lastDays(options.days ?? (device.lastSyncAt ? REPEAT_SYNC_DAYS : FIRST_SYNC_DAYS));
    samples = buildSyncSamples(
      windows.map((w) => w.date),
      await readHealthConnectDays(windows, granted),
    );
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : "Couldn't read Health Connect.";
    await syncDevice(device.id, { samples: [], error: message.slice(0, 300) }).catch(() => undefined);
    throw err;
  }
  return { result: await syncDevice(device.id, { samples }), days: samples.length };
}
