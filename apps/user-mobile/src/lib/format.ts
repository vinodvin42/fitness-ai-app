/** "just now" / "5 min ago" / "3 h ago" / "Oct 4". Returns "Never" for null. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "Never";
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "HH:MM" (24h) -> locale time like "6:30 AM". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((v) => Number(v));
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const PROVIDER_LABEL: Record<string, string> = {
  apple_health: "Apple Health",
  health_connect: "Health Connect",
  garmin: "Garmin",
  fitbit: "Fitbit",
  whoop: "Whoop",
  oura: "Oura",
};

/** Local clock time, e.g. "8:10 AM". */
export function formatTimeOfDay(d: Date | number): string {
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "today at 8:10 AM" / "yesterday at 8:10 AM" / "Oct 4 at 8:10 AM" (offline "last synced"/"saved" lines). */
export function formatDayAndTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const time = formatTimeOfDay(d);
  if (d.toDateString() === now.toDateString()) return `today at ${time}`;
  if (d.toDateString() === y.toDateString()) return `yesterday at ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${time}`;
}

/** Compact elapsed time: "5m ago", "1h 31m ago", "2d ago". */
export function agoShort(ms: number): string {
  const min = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}
