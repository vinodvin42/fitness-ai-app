import { z } from "zod";

// Razorpay integration (20 Aug 2026, gap §14) — see payments.service.ts's
// doc comment for the full order/verify/webhook flow.

export const createOrderSchema = z.object({
  purpose: z.enum(["subscription", "program_purchase", "booking"]),
  // A SubscriptionPlan.id when purpose is "subscription", a Program.id
  // when purpose is "program_purchase", a ProfessionalServiceOffering.id
  // when purpose is "booking" (5 Sep 2026, PAY-01) — resolved and
  // validated inside the service, not here (this schema only checks
  // shape).
  // String id (uuid is only the default generator) — seed uses readable ids
  // like "pro"/"prog-...", so `.uuid()` rejected all seeded plans/programs
  // (found 31 Aug 2026, first real-DB run). A bad id 404s on lookup.
  referenceId: z.string().min(1).max(191),
  // Module 06.05 Coupons (31 Aug 2026) — an optional discount code applied
  // to this order. Validated + priced server-side against the real amount
  // (see payments.service.ts's createOrder); an invalid code fails the
  // order rather than silently charging full price.
  couponCode: z.string().trim().min(1).max(40).optional(),
  // PAY-01 (5 Sep 2026) — required when purpose is "booking", the specific
  // session time being paid for (a coaching booking has no pre-existing
  // row to resolve a schedule from the way subscription/program purchases
  // resolve everything from referenceId alone). Ignored for the other two
  // purposes. Presence/validity checked in the service layer, not here,
  // matching this schema's existing "shape only" scope.
  scheduledAt: z.string().datetime({ message: "scheduledAt must be an ISO 8601 date-time" }).optional(),
  // Optional, purpose "booking" only: an accepted QuoteRequest whose quoted
  // price replaces the offering's list price. Only an id — the price is always
  // read server-side from the quote; there is no client-supplied amount.
  quoteRequestId: z.string().min(1).max(191).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
