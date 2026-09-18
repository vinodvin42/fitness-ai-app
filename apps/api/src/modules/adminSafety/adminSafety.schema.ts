import { z } from "zod";

/**
 * BR-SAF-004 Safety Escalations (R1 Developer 1, 18 Sep 2026) — the admin
 * side of a real escalation queue over `SafetyEscalation`. See
 * adminSafety.service.ts's own top comment for the full design, and
 * prisma/schema.prisma's `SafetyEscalation` model comment for why this
 * model exists at all.
 */
export const listSafetyEscalationsQuerySchema = z.object({
  // "unreviewed" (the default the mobile/admin queue opens on) / "reviewed"
  // / omitted for both — same three-state filter shape as
  // adminSupport.schema.ts's listEscalationsQuerySchema.
  reviewed: z.enum(["true", "false"]).optional(),
});
export type ListSafetyEscalationsQuery = z.infer<typeof listSafetyEscalationsQuerySchema>;

// No body — reviewing is a plain "mark as looked at by me, right now"
// action, same shape as adminSupport's resolveEscalation except with no
// optional notes field: BR-SAF-004's own scope is "make sure a human can
// see this," not a second free-text moderation record layered on top.
export const reviewSafetyEscalationSchema = z.object({}).strict();
export type ReviewSafetyEscalationInput = z.infer<typeof reviewSafetyEscalationSchema>;
