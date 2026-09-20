import { z } from "zod";

/**
 * Coach Private Notes (R2 Wave 3, 20 Sep 2026) — plain text only, no rich
 * formatting/tags/structured fields (explicit out-of-scope for this wave).
 * See coachNotes.service.ts's doc comment for the full design and
 * schema.prisma's `CoachNote` model for why this is never client-visible.
 */
export const createCoachNoteSchema = z.object({
  body: z.string().trim().min(1, "Note can't be empty").max(4000),
});
export type CreateCoachNoteInput = z.infer<typeof createCoachNoteSchema>;

export const updateCoachNoteSchema = z.object({
  body: z.string().trim().min(1, "Note can't be empty").max(4000),
});
export type UpdateCoachNoteInput = z.infer<typeof updateCoachNoteSchema>;
