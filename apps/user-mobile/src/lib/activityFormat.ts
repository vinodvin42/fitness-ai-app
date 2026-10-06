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

export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

/** Seconds per km -> "5:30 /km". */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm == null) return "-";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")} /km`;
}

export function formatSpeed(kmh: number | null): string {
  return kmh == null ? "-" : `${kmh.toFixed(1)} km/h`;
}

/** The headline rate for a kind: pace for runs, speed for rides. */
export function formatRate(a: Pick<ActivityLog, "kind" | "avgPaceSecPerKm" | "avgSpeedKmh">): string {
  return a.kind === "run" ? formatPace(a.avgPaceSecPerKm) : formatSpeed(a.avgSpeedKmh);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
