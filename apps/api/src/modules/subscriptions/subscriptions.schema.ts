import { z } from "zod";

// Subscribe / change plan (docs/mobile/03-screen-inventory.md §M). No card
// details here — see apps/api/README.md and
// docs/mobile/07-open-questions-gaps.md for why: there's no payment
// gateway wired up yet, so this activates a subscription directly rather
// than pretending to process a real card.
export const subscribeSchema = z.object({
  // String id (uuid is only the default generator; seed uses "basic"/"pro"/"elite" ids for Basic/Grow/Prime).
  // See payments.schema.ts's referenceId comment — found 31 Aug 2026.
  planId: z.string().min(1).max(191),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;

// Cancel screen (Figma payments/07, 24 Oct 2026): "Why are you leaving?" and
// an optional comment. Both optional, so older apps that post no body still work.
export const CANCEL_REASONS = ["too_expensive", "not_using", "no_value", "technical", "break", "other"] as const;
export const cancelSubscriptionSchema = z.object({
  reason: z.enum(CANCEL_REASONS).optional(),
  comment: z.string().trim().max(500).optional(),
});

export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
