import { z } from "zod";

// Module 11 AI Operations (27 Aug 2026) — see adminAiOps.service.ts's own
// doc comment for the full scope. Only one field exists to update: whether
// AI Coach chat is reachable. Nothing else about the singleton row is
// admin-editable (updatedByAdminId/updatedAt are set server-side).
export const updateAiCoachSettingsSchema = z.object({
  isEnabled: z.boolean(),
});

export type UpdateAiCoachSettingsInput = z.infer<typeof updateAiCoachSettingsSchema>;
