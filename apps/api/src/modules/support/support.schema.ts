import { z } from "zod";

// §L "Support" (docs/mobile/03-screen-inventory.md), the mobile-writable
// subset of SupportTicket — see the model's own doc comment in
// prisma/schema.prisma for what's deliberately not here (`priority`
// server-defaults rather than being user-set; `status`/`assignee`/a
// message thread are Phase 6 admin-console concerns).
export const supportTicketCategorySchema = z.enum(["bug", "feature_request", "billing", "account", "other"]);

export const createSupportTicketSchema = z.object({
  category: supportTicketCategorySchema.default("other"),
  subject: z.string().min(1).max(140),
  message: z.string().min(1).max(4000),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

// Support Ticket Messages (added 3 Sep 2026, closes gap §19's remaining
// "no message thread" note) — see prisma/schema.prisma's
// SupportTicketMessage doc comment. Same length cap as the ticket's own
// original `message` field, not CoachMessage's shorter 2000 — a reply here
// is describing the same class of content (an ongoing support issue) as
// the initial submission, so there's no reason for a tighter limit.
export const sendSupportTicketMessageSchema = z.object({
  body: z.string().trim().min(1, "Message can't be empty").max(4000),
});
export type SendSupportTicketMessageInput = z.infer<typeof sendSupportTicketMessageSchema>;
