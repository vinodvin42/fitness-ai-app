import { z } from "zod";

// Razorpay integration (20 Aug 2026, gap §14) — see payments.service.ts's
// doc comment for the full order/verify/webhook flow.

export const createOrderSchema = z.object({
  purpose: z.enum(["subscription", "program_purchase"]),
  // A SubscriptionPlan.id when purpose is "subscription", a Program.id
  // when purpose is "program_purchase" — resolved and validated inside
  // the service, not here (this schema only checks shape).
  // String id (uuid is only the default generator) — seed uses readable ids
  // like "pro"/"prog-...", so `.uuid()` rejected all seeded plans/programs
  // (found 31 Aug 2026, first real-DB run). A bad id 404s on lookup.
  referenceId: z.string().min(1).max(191),
  // Module 06.05 Coupons (31 Aug 2026) — an optional discount code applied
  // to this order. Validated + priced server-side against the real amount
  // (see payments.service.ts's createOrder); an invalid code fails the
  // order rather than silently charging full price.
  couponCode: z.string().trim().min(1).max(40).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
