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
