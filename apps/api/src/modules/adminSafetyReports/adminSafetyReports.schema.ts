import { SafetyReportOutcome, SafetyReportSeverity, SafetyReportStatus } from "@prisma/client";
import { z } from "zod";

// 08.04 Safety & Abuse Reports (Oct 2026) — see adminSafetyReports.service.ts.
export const listSafetyReportsQuerySchema = z.object({
  status: z.nativeEnum(SafetyReportStatus).optional(),
  severity: z.nativeEnum(SafetyReportSeverity).optional(),
});
export type ListSafetyReportsQuery = z.infer<typeof listSafetyReportsQuerySchema>;

// `reason` is the resolution note. It is named `reason` so the admin client's
// change-reason step (lib/api.ts) recognises it and doesn't ask twice.
export const resolveSafetyReportSchema = z.object({
  outcome: z.nativeEnum(SafetyReportOutcome),
  reason: z.string().trim().min(10).max(1000),
});
export type ResolveSafetyReportInput = z.infer<typeof resolveSafetyReportSchema>;
