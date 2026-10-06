import { z } from "zod";

export const createQuoteRequestSchema = z.object({
  professionalId: z.string().min(1).max(191),
  serviceType: z.enum(["fitness", "nutrition", "combined"]),
  message: z.string().trim().min(1).max(2000),
});
export type CreateQuoteRequestInput = z.infer<typeof createQuoteRequestSchema>;

export const listQuoteRequestsQuerySchema = z.object({
  status: z.enum(["pending", "quoted", "declined", "accepted", "expired", "consumed"]).optional(),
});
export type ListQuoteRequestsQuery = z.infer<typeof listQuoteRequestsQuerySchema>;

// Professional's quote. Amounts in minor units (paise for INR), like every priceCents here.
export const sendQuoteSchema = z.object({
  priceCents: z.number().int().min(1).max(100_000_000),
  currency: z.string().trim().length(3).toUpperCase().default("INR"),
  note: z.string().trim().max(1000).optional(),
  expiresAt: z.string().datetime({ message: "expiresAt must be an ISO 8601 date-time" }),
});
export type SendQuoteInput = z.infer<typeof sendQuoteSchema>;

export const declineQuoteSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type DeclineQuoteInput = z.infer<typeof declineQuoteSchema>;
