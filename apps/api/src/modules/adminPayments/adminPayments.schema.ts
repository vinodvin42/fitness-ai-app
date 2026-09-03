import { z } from "zod";

// `Payment.status`/`Payment.purpose` real enum values (prisma/schema.prisma)
// — see adminPayments.service.ts's top comment for the full module scope.
export const paymentStatuses = ["created", "paid", "failed"] as const;
export const paymentPurposes = ["subscription", "program_purchase"] as const;

// 06.03 Payments' "filterable transaction table" (docs/admin/03-screen-inventory.md
// §06.03) — Status/Purpose are real column filters; a createdAt date range
// and a search box (provider order/payment id, or the paying user's name/
// email) follow the same convention every other directory screen in this
// console already uses (Relationships, Users, Programs, ...).
export const listPaymentsQuerySchema = z.object({
  status: z.enum(paymentStatuses).optional(),
  purpose: z.enum(paymentPurposes).optional(),
  search: z.string().trim().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
