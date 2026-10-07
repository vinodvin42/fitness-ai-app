import type { ActivityKind, ActivityLog } from "@fitness-ai-app/types";

export function kindLabel(kind: ActivityKind): string {
  return kind === "run" ? "Run" : "Ride";
}

/** 3725 -> "1:02:05", 125 -> "2:05". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const KM_PER_MI = 1.609344;
export type DistanceUnit = "km" | "mi";

/** Distance in the user's unit (Settings > Measurement Units); storage stays metres. */
export function formatKm(meters: number, unit: DistanceUnit = "km"): string {
  return unit === "mi" ? `${(meters / 1000 / KM_PER_MI).toFixed(2)} mi` : `${(meters / 1000).toFixed(2)} km`;
}

/** Seconds per km -> "5:30 /km". */
export function formatPace(secPerKm: number | null, unit: DistanceUnit = "km"): string {
  if (secPerKm == null) return "-";
  const perUnit = unit === "mi" ? secPerKm * KM_PER_MI : secPerKm;
  const total = Math.round(perUnit);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")} /${unit}`;
}

export function formatSpeed(kmh: number | null, unit: DistanceUnit = "km"): string {
  if (kmh == null) return "-";
  return unit === "mi" ? `${(kmh / KM_PER_MI).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`;
}

/** The headline rate for a kind: pace for runs, speed for rides. */
export function formatRate(a: Pick<ActivityLog, "kind" | "avgPaceSecPerKm" | "avgSpeedKmh">, unit: DistanceUnit = "km"): string {
  return a.kind === "run" ? formatPace(a.avgPaceSecPerKm, unit) : formatSpeed(a.avgSpeedKmh, unit);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
