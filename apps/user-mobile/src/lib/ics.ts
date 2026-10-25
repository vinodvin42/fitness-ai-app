/**
 * A calendar invite (.ics, RFC 5545) for a booked session (Figma coach/08 "Add to calendar";
 * 25 Oct 2026). Pure, no imports, so tests/ics.check.cjs can run it. Times are written in UTC, so
 * any calendar app shows them in the member's own time zone.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** 2026-10-27T09:00:00.000Z -> 20261027T090000Z */
export function icsStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Text values escape backslash, comma, semicolon and new lines. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Lines longer than 75 characters continue on the next line after a space. */
export function icsFold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join("\r\n");
}

export interface CalendarEvent {
  /** Stable id (the booking id), so adding twice updates the same event. */
  uid: string;
  title: string;
  /** ISO start time. */
  start: string;
  durationMinutes: number;
  description?: string;
  /** Minutes before the start for the reminder; 0 = none. */
  alarmMinutes?: number;
}

export function buildIcs(e: CalendarEvent, now: Date = new Date()): string {
  const start = new Date(e.start);
  const end = new Date(start.getTime() + e.durationMinutes * 60_000);
  const alarm = e.alarmMinutes ?? 30;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FynroX//Coaching//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@fynrox.com`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    ...(alarm > 0 ? ["BEGIN:VALARM", `TRIGGER:-PT${alarm}M`, "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(e.title)}`, "END:VALARM"] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
