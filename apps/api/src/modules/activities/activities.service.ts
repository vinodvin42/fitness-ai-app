import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import type { ActivitySummaryQuery, CreateActivityInput, ListActivitiesQuery } from "./activities.schema";

/**
 * Endurance tracker (run/ride). Pace (runs) and speed (rides) are derived
 * from duration/distance when the client doesn't send them. Everything
 * returned is computed from the user's own real ActivityLog rows.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

type ActivityRow = {
  id: string;
  kind: string;
  startedAt: Date;
  durationSeconds: number;
  distanceMeters: number;
  avgPaceSecPerKm: number | null;
  avgSpeedKmh: number | null;
  elevationGainM: number | null;
  calories: number | null;
  routePolyline: string | null;
  source: string;
  notes: string | null;
  createdAt: Date;
};

function toActivity(a: ActivityRow, withRoute: boolean) {
  return {
    id: a.id,
    kind: a.kind as "run" | "ride",
    startedAt: a.startedAt.toISOString(),
    durationSeconds: a.durationSeconds,
    distanceMeters: a.distanceMeters,
    avgPaceSecPerKm: a.avgPaceSecPerKm,
    avgSpeedKmh: a.avgSpeedKmh,
    elevationGainM: a.elevationGainM,
    calories: a.calories,
    // Polylines can be large; list responses only flag presence.
    routePolyline: withRoute ? a.routePolyline : null,
    hasRoute: a.routePolyline != null,
    source: a.source as "manual" | "tracked",
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
  };
}

export async function createActivity(userId: string, input: CreateActivityInput) {
  const startedAt = new Date(input.startedAt);
  if (startedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new ApiHttpError(400, "invalid_start_time", "startedAt cannot be in the future");
  }
  const km = input.distanceMeters / 1000;
  const avgPaceSecPerKm = input.avgPaceSecPerKm ?? (input.kind === "run" ? Math.round(input.durationSeconds / km) : undefined);
  const avgSpeedKmh = input.avgSpeedKmh ?? (input.kind === "ride" ? Math.round((km / (input.durationSeconds / 3600)) * 10) / 10 : undefined);
  if (input.kind === "ride" && avgSpeedKmh !== undefined && avgSpeedKmh > 120) {
    throw new ApiHttpError(400, "implausible_activity", "Distance and duration imply an implausible speed");
  }

  const row = await prisma.activityLog.create({
    data: {
      userId,
      kind: input.kind,
      startedAt,
      durationSeconds: input.durationSeconds,
      distanceMeters: input.distanceMeters,
      avgPaceSecPerKm,
      avgSpeedKmh,
      elevationGainM: input.elevationGainM,
      calories: input.calories,
      routePolyline: input.routePolyline,
      source: input.source,
      notes: input.notes,
    },
  });
  return toActivity(row as ActivityRow, true);
}

export async function listActivities(userId: string, query: ListActivitiesQuery) {
  const rows = await prisma.activityLog.findMany({
    where: { userId, ...(query.kind ? { kind: query.kind } : {}) },
    orderBy: { startedAt: "desc" },
    take: query.limit,
  });
  return { items: (rows as ActivityRow[]).map((r) => toActivity(r, false)) };
}

export async function getActivity(userId: string, id: string) {
  const row = await prisma.activityLog.findFirst({ where: { id, userId } });
  if (!row) throw new ApiHttpError(404, "activity_not_found", "Activity not found");
  return toActivity(row as ActivityRow, true);
}

export async function deleteActivity(userId: string, id: string) {
  const row = await prisma.activityLog.findFirst({ where: { id, userId }, select: { id: true } });
  if (!row) throw new ApiHttpError(404, "activity_not_found", "Activity not found");
  await prisma.activityLog.delete({ where: { id } });
  return { deleted: true, id };
}

function startOfUtcWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * DAY_MS);
}

export async function getActivitySummary(userId: string, query: ActivitySummaryQuery) {
  const weeksCount = Number(query.range.replace("w", ""));
  const rangeStart = new Date(startOfUtcWeek(new Date()).getTime() - (weeksCount - 1) * WEEK_MS);
  const rows = (await prisma.activityLog.findMany({
    where: { userId, startedAt: { gte: rangeStart }, ...(query.kind ? { kind: query.kind } : {}) },
    orderBy: { startedAt: "asc" },
  })) as ActivityRow[];

  const weeks = Array.from({ length: weeksCount }, (_, i) => ({
    weekStart: new Date(rangeStart.getTime() + i * WEEK_MS).toISOString().slice(0, 10),
    count: 0,
    distanceMeters: 0,
    durationSeconds: 0,
  }));
  let distanceMeters = 0;
  let durationSeconds = 0;
  let elevationGainM = 0;
  let calories = 0;
  for (const a of rows) {
    distanceMeters += a.distanceMeters;
    durationSeconds += a.durationSeconds;
    elevationGainM += a.elevationGainM ?? 0;
    calories += a.calories ?? 0;
    const i = Math.floor((startOfUtcWeek(a.startedAt).getTime() - rangeStart.getTime()) / WEEK_MS);
    if (i >= 0 && i < weeksCount) {
      weeks[i].count += 1;
      weeks[i].distanceMeters += a.distanceMeters;
      weeks[i].durationSeconds += a.durationSeconds;
    }
  }
  const km = distanceMeters / 1000;
  const longest = rows.reduce<ActivityRow | null>((b, a) => (!b || a.distanceMeters > b.distanceMeters ? a : b), null);
  // Fastest pace only for runs of at least 1 km (avoid GPS-blip "records").
  const bestPace = rows
    .filter((a) => a.kind === "run" && a.distanceMeters >= 1000 && a.avgPaceSecPerKm != null)
    .reduce<ActivityRow | null>((b, a) => (!b || (a.avgPaceSecPerKm as number) < (b.avgPaceSecPerKm as number) ? a : b), null);

  return {
    kind: query.kind ?? null,
    range: query.range,
    count: rows.length,
    distanceMeters,
    durationSeconds,
    elevationGainM,
    calories,
    avgPaceSecPerKm: km > 0 ? Math.round(durationSeconds / km) : null,
    avgSpeedKmh: durationSeconds > 0 ? Math.round((km / (durationSeconds / 3600)) * 10) / 10 : null,
    longestActivity: longest ? toActivity(longest, false) : null,
    fastestPaceActivity: bestPace ? toActivity(bestPace, false) : null,
    weeks,
  };
}
