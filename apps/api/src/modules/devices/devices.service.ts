import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { DEVICE_PERMISSIONS, PairDeviceInput, SyncDeviceInput, UpdateDeviceInput } from "./devices.schema";

/**
 * Connected devices & sync (Recover 02-05). Honest scope: there is no
 * vendor SDK on the server — the mobile client reads samples from the
 * device or health store and POSTs them here. Samples are merged into the
 * day's RecoveryLog (the same one-row-per-user-per-day table manual
 * recovery entry uses); steps have no RecoveryLog column, so they count as
 * ingested but are not stored.
 *
 * UPDATE: steps / active calories / active minutes / SpO2 / stress are now
 * stored on RecoveryLog, and each device has `permissions` (the data it may
 * supply) - a sync drops values outside them.
 */

type DeviceRow = {
  id: string;
  provider: string;
  name: string;
  kind: string;
  status: string;
  lastSyncAt: Date | null;
  lastError: string | null;
  batteryPct: number | null;
  permissions: string[];
  createdAt: Date;
};

type RunRow = {
  id: string;
  deviceId: string;
  startedAt: Date;
  finishedAt: Date | null;
  recordsIngested: number;
  status: string;
};

function toDevice(d: DeviceRow) {
  return {
    id: d.id,
    provider: d.provider,
    name: d.name,
    kind: d.kind,
    status: d.status,
    lastSyncAt: d.lastSyncAt,
    lastError: d.lastError,
    batteryPct: d.batteryPct,
    permissions: d.permissions ?? [...DEVICE_PERMISSIONS],
    createdAt: d.createdAt,
  };
}

function toRun(r: RunRow) {
  return {
    id: r.id,
    deviceId: r.deviceId,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    recordsIngested: r.recordsIngested,
    status: r.status,
  };
}

function dateOnlyUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y, m - 1, d));
}

async function getOwnedDevice(userId: string, deviceId: string) {
  const device = await prisma.connectedDevice.findUnique({ where: { id: deviceId } });
  if (!device || device.userId !== userId) {
    // 404, not 403 — don't reveal that a device id belongs to someone else.
    throw new ApiHttpError(404, "device_not_found", "Device not found");
  }
  return device as DeviceRow & { userId: string };
}

export async function listDevices(userId: string) {
  const rows = (await prisma.connectedDevice.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })) as DeviceRow[];
  return { items: rows.map(toDevice) };
}

export async function pairDevice(userId: string, input: PairDeviceInput) {
  const row = await prisma.connectedDevice.create({
    data: {
      userId,
      provider: input.provider,
      name: input.name,
      kind: input.kind,
      batteryPct: input.batteryPct ?? null,
      permissions: input.permissions ?? [...DEVICE_PERMISSIONS],
    },
  });
  await recordAudit({
    actorId: userId,
    action: "device.paired",
    entityType: "ConnectedDevice",
    entityId: row.id,
    metadata: { provider: input.provider, kind: input.kind },
  });
  return toDevice(row as DeviceRow);
}

export async function removeDevice(userId: string, deviceId: string) {
  await getOwnedDevice(userId, deviceId);
  await prisma.connectedDevice.delete({ where: { id: deviceId } });
  await recordAudit({
    actorId: userId,
    action: "device.removed",
    entityType: "ConnectedDevice",
    entityId: deviceId,
    metadata: {},
  });
}

export async function syncDevice(userId: string, deviceId: string, input: SyncDeviceInput) {
  const device = await getOwnedDevice(userId, deviceId);
  const startedAt = new Date();

  if (input.error) {
    const run = await prisma.deviceSyncRun.create({
      data: { deviceId, userId, startedAt, finishedAt: new Date(), recordsIngested: 0, status: "error" },
    });
    const updated = await prisma.connectedDevice.update({
      where: { id: deviceId },
      data: { status: "error", lastError: input.error },
    });
    return { device: toDevice(updated as DeviceRow), run: toRun(run as RunRow) };
  }

  const allowed = new Set<string>(device.permissions ?? DEVICE_PERMISSIONS);
  let ingested = 0;
  for (const s of input.samples) {
    // Only keep values the user allowed this device to supply.
    const kept = {
      ...(allowed.has("heart_rate") && s.restingHr != null ? { restingHeartRate: s.restingHr } : {}),
      ...(allowed.has("heart_rate") && s.hrvMs != null ? { hrvMs: s.hrvMs } : {}),
      ...(allowed.has("sleep") && s.sleepHours != null ? { sleepHours: s.sleepHours } : {}),
      ...(allowed.has("steps") && s.steps != null ? { steps: s.steps } : {}),
      ...(allowed.has("workouts") && s.activeCalories != null ? { activeCalories: s.activeCalories } : {}),
      ...(allowed.has("workouts") && s.activeMinutes != null ? { activeMinutes: s.activeMinutes } : {}),
      ...(allowed.has("spo2") && s.spo2 != null ? { spo2: s.spo2 } : {}),
      ...(allowed.has("stress") && s.stressScore != null ? { stressScore: s.stressScore } : {}),
    };
    const date = dateOnlyUtc(s.date);
    // Smart-scale body readings become a BodyMeasurement (source "device"), one per device per day.
    if (device.kind === "scale" && (s.weightKg != null || s.bodyFatPercent != null)) {
      const loggedAt = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const existing = await prisma.bodyMeasurement.findFirst({ where: { userId, source: "device", deviceName: device.name, loggedAt } });
      const reading = {
        ...(s.weightKg != null ? { weightKg: s.weightKg } : {}),
        ...(s.bodyFatPercent != null ? { bodyFatPercent: s.bodyFatPercent } : {}),
      };
      if (existing) await prisma.bodyMeasurement.update({ where: { id: existing.id }, data: reading });
      else await prisma.bodyMeasurement.create({ data: { userId, source: "device", deviceName: device.name, loggedAt, ...reading } });
      ingested += 1;
    }
    if (Object.keys(kept).length === 0) continue;
    // Only the fields the device reported, so manual soreness/energy/notes survive.
    await prisma.recoveryLog.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...kept },
      update: kept,
    });
    ingested += 1;
  }
  const finishedAt = new Date();
  const run = await prisma.deviceSyncRun.create({
    data: { deviceId, userId, startedAt, finishedAt, recordsIngested: ingested, status: "success" },
  });
  const updated = await prisma.connectedDevice.update({
    where: { id: deviceId },
    data: {
      status: "paired",
      lastSyncAt: finishedAt,
      lastError: null,
      ...(input.batteryPct != null ? { batteryPct: input.batteryPct } : {}),
    },
  });

  return { device: toDevice(updated as DeviceRow), run: toRun(run as RunRow) };
}

export async function getSyncStatus(userId: string) {
  const devices = (await prisma.connectedDevice.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })) as DeviceRow[];

  const items = await Promise.all(
    devices.map(async (d) => {
      const latest = (await prisma.deviceSyncRun.findFirst({
        where: { deviceId: d.id, userId },
        orderBy: { startedAt: "desc" },
      })) as RunRow | null;
      return { device: toDevice(d), latestRun: latest ? toRun(latest) : null };
    }),
  );
  return { items };
}

export async function updateDevice(userId: string, deviceId: string, input: UpdateDeviceInput) {
  await getOwnedDevice(userId, deviceId);
  const permissions = Array.from(new Set(input.permissions));
  const row = await prisma.connectedDevice.update({ where: { id: deviceId }, data: { permissions } });
  await recordAudit({
    actorId: userId,
    action: "device.permissions_updated",
    entityType: "ConnectedDevice",
    entityId: deviceId,
    metadata: { permissions },
  });
  return toDevice(row as DeviceRow);
}

type StreamLog = {
  date: Date;
  restingHeartRate: number | null;
  sleepHours: number | null;
  steps: number | null;
  activeCalories: number | null;
  spo2: number | null;
};

/**
 * GET /devices/streams - latest real value per data stream (Recover 05).
 * Value = newest RecoveryLog row that has it (BodyMeasurement for weight).
 * `source` = "device" when a connected device allowed to supply the stream
 * synced on/after that value's day, else "manual" (RecoveryLog has no
 * per-value source column).
 */
export async function getDataStreams(userId: string) {
  const [devices, logs, weight] = await Promise.all([
    prisma.connectedDevice.findMany({ where: { userId }, orderBy: { lastSyncAt: "desc" } }) as Promise<DeviceRow[]>,
    prisma.recoveryLog.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 30 }) as Promise<StreamLog[]>,
    prisma.bodyMeasurement.findFirst({
      where: { userId, weightKg: { not: null } },
      orderBy: { loggedAt: "desc" },
    }) as Promise<{ weightKg: number | null; loggedAt: Date; source: string; deviceName: string | null } | null>,
  ]);
  const defs: Array<{ key: string; label: string; perm: string; pick: (l: StreamLog) => number | null }> = [
    { key: "steps", label: "Steps", perm: "steps", pick: (l) => l.steps },
    { key: "heart_rate", label: "Heart Rate", perm: "heart_rate", pick: (l) => l.restingHeartRate },
    { key: "sleep", label: "Sleep", perm: "sleep", pick: (l) => l.sleepHours },
    { key: "calories", label: "Calories", perm: "workouts", pick: (l) => l.activeCalories },
    { key: "spo2", label: "Blood Oxygen", perm: "spo2", pick: (l) => l.spo2 },
  ];
  const DAY = 24 * 60 * 60 * 1000;
  const items: Array<{
    key: string;
    label: string;
    value: number | null;
    date: Date | null;
    source: "device" | "manual" | null;
    deviceName: string | null;
    stale: boolean;
  }> = defs.map((d) => {
    const log = logs.find((l) => d.pick(l) != null);
    if (!log) return { key: d.key, label: d.label, value: null, date: null, source: null, deviceName: null, stale: false };
    const dev = devices.find((x) => x.lastSyncAt && x.lastSyncAt >= log.date && x.permissions.includes(d.perm));
    return {
      key: d.key,
      label: d.label,
      value: d.pick(log),
      date: log.date,
      source: dev ? "device" : "manual",
      deviceName: dev?.name ?? null,
      stale: Date.now() - log.date.getTime() > 3 * DAY,
    };
  });
  items.push({
    key: "weight",
    label: "Weight",
    value: weight?.weightKg ?? null,
    date: weight?.loggedAt ?? null,
    source: weight ? (weight.source === "device" ? "device" : "manual") : null,
    deviceName: weight?.source === "device" ? weight.deviceName : null,
    stale: weight ? Date.now() - weight.loggedAt.getTime() > 14 * DAY : false,
  });
  return { items };
}
