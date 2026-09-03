import { z } from "zod";

// `SupportTicket`'s three real enums (prisma/schema.prisma) — see
// adminSupport.service.ts's top comment for the full module scope.
export const supportTicketCategories = ["bug", "feature_request", "billing", "account", "other"] as const;
export const supportTicketPriorities = ["low", "normal", "high"] as const;
export const supportTicketStatuses = ["open", "in_progress", "resolved", "closed"] as const;

// 08.01 Support Tickets' "filterable ticket list ... status/category
// filters" (docs/admin/03-screen-inventory.md §08.01) — Status/Category
// are real column filters; Priority and a subject/message/user search
// follow the same convention every other directory screen in this
// console already uses.
export const listSupportTicketsQuerySchema = z.object({
  status: z.enum(supportTicketStatuses).optional(),
  category: z.enum(supportTicketCategories).optional(),
  priority: z.enum(supportTicketPriorities).optional(),
  search: z.string().trim().max(200).optional(),
});

// The one real state-changing action this module ships: re-triaging a
// ticket's status/priority/category — see adminSupport.service.ts's top
// comment for why this replaces the Figma's reply-composer/assignee
// actions rather than building either.
export const updateSupportTicketSchema = z
  .object({
    status: z.enum(supportTicketStatuses).optional(),
    priority: z.enum(supportTicketPriorities).optional(),
    category: z.enum(supportTicketCategories).optional(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

export type ListSupportTicketsQuery = z.infer<typeof listSupportTicketsQuerySchema>;
export type UpdateSupportTicketInput = z.infer<typeof updateSupportTicketSchema>;

// 08.02 Escalations, added 25 Aug 2026 — see adminSupport.service.ts's top
// comment for the full reasoning.
export const escalationStatuses = ["open", "resolved"] as const;

export const escalateSupportTicketSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(2000),
});

export const listEscalationsQuerySchema = z.object({
  status: z.enum(escalationStatuses).optional(),
});

export const resolveEscalationSchema = z.object({
  resolutionNotes: z.string().trim().max(2000).optional(),
});

export type EscalateSupportTicketInput = z.infer<typeof escalateSupportTicketSchema>;
export type ListEscalationsQuery = z.infer<typeof listEscalationsQuerySchema>;
export type ResolveEscalationInput = z.infer<typeof resolveEscalationSchema>;
