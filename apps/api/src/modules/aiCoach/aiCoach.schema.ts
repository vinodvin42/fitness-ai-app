import { z } from "zod";

// AI Coach chat (docs/mobile/03-screen-inventory.md §H). 2000 chars is
// generous for a chat message while keeping a single turn's token cost
// (and therefore API bill) bounded — same reasoning as every other
// deliberately-capped free-text field in this app (SupportTicket.message,
// Reminder.label, etc.), just a larger number since this is a
// conversational field, not a short label.
export const sendAiCoachMessageSchema = z.object({
  content: z.string().min(1, "Message can't be empty").max(2000, "Message is too long"),
});
export type SendAiCoachMessageInput = z.infer<typeof sendAiCoachMessageSchema>;
