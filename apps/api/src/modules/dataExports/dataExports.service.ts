import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createActionItem } from "../../lib/adminActionQueue";
import { getDecryptedOnboardingProfile } from "../../lib/healthData";
import { createZip } from "../../lib/zip";
import { createTextPdf } from "../../lib/simplePdf";

/**
 * Profile & Settings 16 - "Download my data". A request generates a real
 * ZIP on demand (summary PDF + CSV files) and stores the bytes in
 * user_data_exports for 7 days. Only the owner can download. A new request
 * discards the bytes of earlier ones. Professionals, gyms and partners never
 * get a copy - nothing here is shared.
 */

export const EXPORT_TTL_DAYS = 7;
const MAX_EXPORTS_PER_DAY = 5;
const ROW_CAP = 50_000;

type FileGroup = "summary" | "activity" | "decisions";
type StoredFile = { name: string; group: FileGroup; size: number };

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection for free-text cells.
  if (typeof v === "string" && /^[=+@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): Buffer {
  const lines = [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  // UTF-8 BOM so Excel opens non-ASCII text correctly.
  return Buffer.from("﻿" + lines.join("\r\n") + "\r\n", "utf8");
}

async function buildFiles(userId: string): Promise<{ name: string; group: FileGroup; data: Buffer }[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiHttpError(404, "user_not_found", "User not found");
  const take = ROW_CAP;

  const [onboarding, sessions, meals, recovery, measurements, checkIns, recommendations, messages, tickets, consents, subscriptions, water] =
    await Promise.all([
      // Health fields are encrypted at rest: read through the decrypting accessor so the
      // export holds the user's real declared conditions, never ciphertext (and never the
      // *Enc storage columns).
      getDecryptedOnboardingProfile(userId),
      prisma.workoutSession.findMany({
        where: { userId },
        include: {
          workout: { select: { name: true } },
          setLogs: { include: { exercise: { select: { name: true } } }, orderBy: { loggedAt: "asc" } },
        },
        orderBy: { startedAt: "asc" },
        take,
      }),
      prisma.mealLog.findMany({ where: { userId }, orderBy: { loggedAt: "asc" }, take }),
      prisma.recoveryLog.findMany({ where: { userId }, orderBy: { date: "asc" }, take }),
      prisma.bodyMeasurement.findMany({ where: { userId }, orderBy: { loggedAt: "asc" }, take }),
      prisma.checkIn.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, take }),
      prisma.recommendation.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, take }),
      prisma.coachMessage.findMany({
        where: { userId },
        include: { professional: { select: { fullName: true } } },
        orderBy: { createdAt: "asc" },
        take,
      }),
      prisma.supportTicket.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, take }),
      prisma.consent.findMany({ where: { userId } }),
      prisma.subscription.findMany({ where: { userId } }),
      prisma.waterLog.findMany({ where: { userId }, orderBy: { loggedAt: "asc" }, take }),
    ]);

  const workoutRows: unknown[][] = [];
  for (const s of sessions) {
    if (s.setLogs.length === 0) {
      workoutRows.push([s.id, s.workout?.name ?? "", s.status, s.startedAt, s.completedAt, "", "", "", "", "", ""]);
    }
    for (const l of s.setLogs) {
      workoutRows.push([
        s.id,
        s.workout?.name ?? "",
        s.status,
        s.startedAt,
        s.completedAt,
        l.exercise?.name ?? l.exerciseId,
        l.setNumber,
        l.weightKg,
        l.reps,
        l.rpe,
        l.isWarmup,
      ]);
    }
  }

  const files: { name: string; group: FileGroup; data: Buffer }[] = [];
  const add = (name: string, group: FileGroup, headers: string[], rows: unknown[][]) =>
    files.push({ name, group, data: toCsv(headers, rows) });

  add(
    "workouts.csv",
    "activity",
    ["session_id", "workout", "status", "started_at", "completed_at", "exercise", "set_number", "weight_kg", "reps", "rpe", "is_warmup"],
    workoutRows,
  );
  add(
    "meals.csv",
    "activity",
    ["logged_at", "meal_type", "name", "calories", "protein_g", "carbs_g", "fat_g", "source"],
    meals.map((m) => [m.loggedAt, m.mealType, m.name, m.calories, m.proteinG, m.carbsG, m.fatG, m.source]),
  );
  add("water.csv", "activity", ["logged_at", "glasses"], water.map((w) => [w.loggedAt, w.glasses]));
  add(
    "sleep_recovery.csv",
    "activity",
    ["date", "sleep_hours", "resting_heart_rate", "hrv_ms", "soreness", "energy_level", "steps", "active_calories", "active_minutes", "spo2", "stress_score", "notes"],
    recovery.map((r) => [r.date, r.sleepHours, r.restingHeartRate, r.hrvMs, r.soreness, r.energyLevel, r.steps, r.activeCalories, r.activeMinutes, r.spo2, r.stressScore, r.notes]),
  );
  add(
    "body_measurements.csv",
    "activity",
    ["logged_at", "weight_kg", "body_fat_percent", "chest_cm", "waist_cm", "hips_cm", "arms_cm", "thighs_cm", "neck_cm", "shoulders_cm", "source"],
    measurements.map((m) => [m.loggedAt, m.weightKg, m.bodyFatPercent, m.chestCm, m.waistCm, m.hipsCm, m.armsCm, m.thighsCm, m.neckCm, m.shouldersCm, m.source]),
  );
  add(
    "check_ins.csv",
    "activity",
    ["created_at", "period", "period_key", "energy", "soreness", "adherence", "note"],
    checkIns.map((c) => [c.createdAt, c.period, c.periodKey, c.energy, c.soreness, c.adherence, c.note]),
  );
  add(
    "decisions.csv",
    "decisions",
    ["created_at", "kind", "status", "rationale", "decided_by", "decided_at"],
    recommendations.map((r) => [r.createdAt, r.kind, r.status, r.rationale, r.decidedByRole, r.decidedAt]),
  );
  add(
    "messages.csv",
    "decisions",
    ["sent_at", "professional", "sender", "message"],
    messages.map((m) => [m.createdAt, m.professional?.fullName ?? "", m.sender, m.content]),
  );
  add(
    "support_tickets.csv",
    "decisions",
    ["created_at", "category", "status", "subject", "message"],
    tickets.map((t) => [t.createdAt, t.category, t.status, t.subject, t.message]),
  );

  const lines: string[] = [
    "# Fynrox - your data summary",
    `Generated ${new Date().toISOString()}`,
    "",
    "# Account",
    `Name: ${user.fullName}`,
    `Email: ${user.email}`,
    `Member since: ${user.createdAt.toISOString().slice(0, 10)}`,
    "",
    "# What is in this export",
    `Workout sessions: ${sessions.length}`,
    `Meal logs: ${meals.length}`,
    `Water logs: ${water.length}`,
    `Sleep & recovery days: ${recovery.length}`,
    `Body measurements: ${measurements.length}`,
    `Check-ins: ${checkIns.length}`,
    `Plan recommendations / decisions: ${recommendations.length}`,
    `Messages with professionals: ${messages.length}`,
    `Support tickets: ${tickets.length}`,
    `Subscriptions: ${subscriptions.length}`,
    "",
    "# Consents",
    ...(consents.length ? consents.map((c) => `${c.type}: ${c.granted ? "granted" : "not granted"}`) : ["No consent choices recorded."]),
    "",
    "# Profile",
  ];
  if (onboarding) {
    for (const [k, v] of Object.entries(onboarding)) {
      if (["id", "userId", "createdAt", "updatedAt"].includes(k) || v === null || v === undefined) continue;
      const text = Array.isArray(v) ? v.join(", ") : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "object" ? JSON.stringify(v) : String(v);
      lines.push(`${k}: ${text}`);
    }
  } else {
    lines.push("No onboarding profile.");
  }
  lines.push("", "The CSV files in this ZIP hold the full detail. Only you can download this export.");
  files.unshift({ name: "summary.pdf", group: "summary", data: createTextPdf(lines) });

  return files;
}

type ExportRow = {
  id: string;
  status: "ready" | "failed" | "expired";
  files: unknown;
  zipSize: number;
  createdAt: Date;
  expiresAt: Date;
};

const GROUP_LABELS: Record<FileGroup, string> = {
  summary: "Summary (PDF)",
  activity: "Workouts, meals, sleep (CSV)",
  decisions: "Decision history & messages (CSV)",
};

function toMeta(row: ExportRow) {
  const files = (row.files as StoredFile[]) ?? [];
  const expired = row.status === "expired" || row.expiresAt.getTime() <= Date.now();
  const groups = (["summary", "activity", "decisions"] as FileGroup[]).map((g) => ({
    key: g,
    label: GROUP_LABELS[g],
    size: files.filter((f) => f.group === g).reduce((a, f) => a + f.size, 0),
  }));
  return {
    id: row.id,
    status: expired ? ("expired" as const) : row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    zipSize: row.zipSize,
    files: files.map((f) => ({ name: f.name, size: f.size })),
    groups,
  };
}

export async function createExport(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.userDataExport.count({ where: { userId, createdAt: { gte: since } } });
  if (recent >= MAX_EXPORTS_PER_DAY) {
    throw new ApiHttpError(429, "export_limit", "You can request up to 5 exports per day. Try again tomorrow.");
  }

  const built = await buildFiles(userId);
  const zip = createZip(built.map((f) => ({ name: f.name, data: f.data })));
  const stored: StoredFile[] = built.map((f) => ({ name: f.name, group: f.group, size: f.data.length }));

  // Earlier exports no longer need their bytes.
  await prisma.userDataExport.updateMany({
    where: { userId, bytes: { not: null } },
    data: { bytes: null, status: "expired" },
  });

  const row = await prisma.userDataExport.create({
    data: {
      userId,
      status: "ready",
      files: stored,
      zipSize: zip.length,
      bytes: zip,
      expiresAt: new Date(Date.now() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await recordAudit({ actorId: userId, action: "user.data_exported", entityType: "UserDataExport", entityId: row.id });
  await createActionItem({
    type: "privacy_request",
    entityType: "User",
    entityId: userId,
    severity: "low",
    metadata: { requestType: "data_export" },
  });

  return toMeta(row as ExportRow);
}

export async function getLatestExport(userId: string) {
  const row = await prisma.userDataExport.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, files: true, zipSize: true, createdAt: true, expiresAt: true },
  });
  return { export: row ? toMeta(row as ExportRow) : null };
}

export async function downloadExport(userId: string, exportId: string) {
  const row = await prisma.userDataExport.findUnique({ where: { id: exportId } });
  // 404 (never 403) so another user's export id is not confirmed to exist.
  if (!row || row.userId !== userId) throw new ApiHttpError(404, "export_not_found", "Export not found");
  if (row.status !== "ready" || !row.bytes || row.expiresAt.getTime() <= Date.now()) {
    if (row.bytes) await prisma.userDataExport.update({ where: { id: row.id }, data: { bytes: null, status: "expired" } });
    throw new ApiHttpError(410, "export_expired", "This export has expired. Request a new one.");
  }
  await recordAudit({ actorId: userId, action: "user.data_export_downloaded", entityType: "UserDataExport", entityId: row.id });
  return { bytes: Buffer.from(row.bytes), createdAt: row.createdAt };
}
