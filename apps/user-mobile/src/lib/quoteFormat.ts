import { useEffect, useState } from "react";
import type { QuoteRequest, QuoteRequestStatus, QuoteServiceType } from "@fitness-ai-app/types";

export function quoteServiceLabel(t: QuoteServiceType): string {
  if (t === "fitness") return "Fitness coaching";
  if (t === "nutrition") return "Nutrition coaching";
  return "Combined coaching";
}

/** "Fitness Professional" / "Nutrition Professional" / "Fitness + Nutrition Professional". */
export function professionalRoleLabel(services: string[]): string {
  const f = services.includes("fitness");
  const n = services.includes("nutrition");
  if (f && n) return "Fitness + Nutrition Professional";
  if (n) return "Nutrition Professional";
  if (f) return "Fitness Professional";
  return "Professional";
}

export function firstName(fullName: string | null | undefined, fallback = "your professional"): string {
  const n = (fullName ?? "").trim().split(/\s+/)[0];
  return n || fallback;
}

/** "24 Oct 2026". */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "Sat 24 Oct 2026 · 5:00 PM". */
export function formatDayTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", "");
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

export function formatQuotePrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "-";
  const amount = (cents / 100).toFixed(2);
  if (!currency || currency === "INR") return `₹${amount}`;
  return `${currency} ${amount}`;
}

/** Re-renders every `intervalMs` so countdowns stay current. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "2d 3h left", "4h 12m left", "5m 30s left", or null once past. */
export function formatCountdown(expiresAtIso: string, now: number): string | null {
  const ms = new Date(expiresAtIso).getTime() - now;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m ${sec}s left`;
}

/** The server status, with a "quoted" quote whose expiry has passed shown as expired. */
export function effectiveQuoteStatus(q: QuoteRequest, now: number): QuoteRequestStatus {
  if (q.status === "quoted" && q.quoteExpiresAt && new Date(q.quoteExpiresAt).getTime() <= now) return "expired";
  return q.status;
}

export const QUOTE_STATUS_LABEL: Record<QuoteRequestStatus, string> = {
  pending: "Request pending",
  quoted: "Quote received",
  declined: "Declined",
  accepted: "Quote accepted",
  expired: "Quote expired",
  consumed: "Paid",
  cancelled: "Cancelled",
};

export const QUOTE_STATUS_TONE: Record<QuoteRequestStatus, "warning" | "success" | "danger" | "neutral" | "accent"> = {
  pending: "warning",
  quoted: "accent",
  declined: "danger",
  accepted: "success",
  expired: "neutral",
  consumed: "neutral",
  cancelled: "neutral",
};
