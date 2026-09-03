import { z } from "zod";

/**
 * Coach ↔ Client Messaging (docs/coach/03-screen-inventory.md), added 31 Aug
 * 2026 — see coachMessages.service.ts's doc comment. A single text body,
 * capped; no attachments (no file/media upload path exists in this build).
 */
export const sendCoachMessageSchema = z.object({
  content: z.string().trim().min(1, "Message can't be empty").max(2000),
});
export type SendCoachMessageInput = z.infer<typeof sendCoachMessageSchema>;
