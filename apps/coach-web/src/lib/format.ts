import type { ProfessionalServiceType } from "@fitness-ai-app/types";

/**
 * Formatting shared by every screen. Amounts arrive in paise ("cents") and
 * are shown in rupees; dates and times in the coach's own time zone, en-IN.
 */
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function money(cents: number): string {
  return inr.format(cents / 100);
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function dateLabel(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Date(iso).toLocaleDateString("en-IN", opts);
}

export function dateTimeLabel(iso: string): string {
  return `${dateLabel(iso)}, ${timeLabel(iso)}`;
}

export function periodLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "Today", "Tomorrow" or the date, for grouping a schedule by day. */
export function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(today)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return dateLabel(iso, { weekday: "long", day: "numeric", month: "long" });
}

export const SERVICE_LABELS: Record<ProfessionalServiceType, string> = {
  fitness: "Fitness Coaching",
  nutrition: "Nutrition Coaching",
};

export const SERVICE_SHORT: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };
