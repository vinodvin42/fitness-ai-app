import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { PairDeviceInput, SyncDeviceInput } from "./devices.schema";

/**
 * Connected devices & sync (Recover 02-05). Honest scope: there is no
 * vendor SDK on the server — the mobile client reads samples from the
 * device or health store and POSTs them here. Samples are merged into the
 * day's RecoveryLog (the same one-row-per-user-per-day table manual
 * recovery entry uses); steps have no RecoveryLog column, so they count as
 * ingested but are not stored.
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
  await getOwnedDevice(userId, deviceId);
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

  let ingested = 0;
  for (const s of input.samples) {
    const hasRecoveryMetric = s.restingHr != null || s.sleepHours != null || s.hrvMs != null;
    if (hasRecoveryMetric) {
      const date = dateOnlyUtc(s.date);
      // Only set the fields the device actually reported, so a manual
      // soreness/energy/notes entry for the same day is never overwritten.
      const data = {
        ...(s.restingHr != null ? { restingHeartRate: s.restingHr } : {}),
        ...(s.sleepHours != null ? { sleepHours: s.sleepHours } : {}),
        ...(s.hrvMs != null ? { hrvMs: s.hrvMs } : {}),
      };
      await prisma.recoveryLog.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, ...data },
        update: data,
      });
    }
    if (hasRecoveryMetric || s.steps != null) ingested += 1;
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
