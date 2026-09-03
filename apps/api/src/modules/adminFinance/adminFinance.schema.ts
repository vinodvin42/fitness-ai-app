import { z } from "zod";

// Mirrors prisma/schema.prisma's ExpenseCategory/ExpenseStatus enums
// exactly — category taxonomy lifted directly from 10.03's own spec'd
// expense-waterfall categories (docs/admin/03-screen-inventory.md
// §10.03), not invented. See adminFinance.service.ts's top comment for
// the full module scope.
export const expenseCategories = [
  "coach_settlement",
  "influencer_payout",
  "gateway_fee",
  "ops",
  "marketing",
  "refund",
  "other",
] as const;
export const expenseStatuses = ["pending", "paid"] as const;

export const financeDateRangeQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const listExpensesQuerySchema = z.object({
  category: z.enum(expenseCategories).optional(),
  status: z.enum(expenseStatuses).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const createExpenseSchema = z.object({
  category: z.enum(expenseCategories),
  description: z.string().trim().min(1, "A description is required").max(500),
  amountCents: z.number().int().min(1),
  currency: z.string().trim().length(3).optional(),
  incurredAt: z.coerce.date(),
  notes: z.string().trim().max(2000).optional(),
});

export const listInvoicesQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const upsertTaxConfigSchema = z.object({
  jurisdiction: z.string().trim().min(1, "A jurisdiction is required").max(120),
  ratePercent: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

export type FinanceDateRangeQuery = z.infer<typeof financeDateRangeQuerySchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type UpsertTaxConfigInput = z.infer<typeof upsertTaxConfigSchema>;
