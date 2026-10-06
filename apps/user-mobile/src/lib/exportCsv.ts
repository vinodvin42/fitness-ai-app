import { Platform, Share } from "react-native";
import type { WorkoutHistoryEntry } from "@fitness-ai-app/types";

function cell(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  // Quote anything with a delimiter/quote/newline; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One row per workout session, real values only. */
export function sessionsToCsv(entries: WorkoutHistoryEntry[]): string {
  const header = ["date", "workout", "program", "status", "duration_min", "sets", "volume_kg"];
  const rows = entries.map((e) =>
    [e.startedAt.slice(0, 10), e.workoutName, e.programName, e.status, e.durationMinutes, e.totalSets, Math.round(e.totalVolumeKg * 10) / 10]
      .map(cell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

/** Shares CSV text via the native share sheet; on web, downloads it as a file. Returns false if the user dismissed it. */
export async function shareCsv(filename: string, csv: string): Promise<boolean> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  }
  const res = await Share.share({ title: filename, message: csv });
  return res.action !== Share.dismissedAction;
}
