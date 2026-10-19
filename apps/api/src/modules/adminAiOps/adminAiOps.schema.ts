import { z } from "zod";

// Module 11 AI Operations (27 Aug 2026) — see adminAiOps.service.ts's own
// doc comment for the full scope. Only one field exists to update: whether
// AI Coach chat is reachable. Nothing else about the singleton row is
// admin-editable (updatedByAdminId/updatedAt are set server-side).
export const updateAiCoachSettingsSchema = z.object({
  isEnabled: z.boolean(),
});

export type UpdateAiCoachSettingsInput = z.infer<typeof updateAiCoachSettingsSchema>;

// 11.02 AI Usage & Metrics (Oct 2026): the window in days. Only the three
// windows the screen offers are accepted.
export const AI_USAGE_WINDOWS = [7, 30, 90] as const;
export const aiUsageQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => (AI_USAGE_WINDOWS as readonly number[]).includes(d), { message: "days must be 7, 30 or 90" })
    .default(30),
});
export type AiUsageQuery = z.infer<typeof aiUsageQuerySchema>;

// 11.03 AI Safety / Overrides (Oct 2026) — see listAiAnswerReports in
// adminAiOps.service.ts.
export const listAiAnswerReportsQuerySchema = z.object({
  status: z.enum(["open", "reviewed", "answer_hidden"]).optional(),
});
export type ListAiAnswerReportsQuery = z.infer<typeof listAiAnswerReportsQuerySchema>;

// `reason` is the review note; named `reason` so the admin client's
// change-reason step recognises it and doesn't ask twice.
export const resolveAiAnswerReportSchema = z.object({
  action: z.enum(["reviewed", "hide_answer"]),
  reason: z.string().trim().min(10).max(1000),
});
export type ResolveAiAnswerReportInput = z.infer<typeof resolveAiAnswerReportSchema>;
