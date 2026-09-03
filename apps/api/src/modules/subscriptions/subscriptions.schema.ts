import { z } from "zod";

// Subscribe / change plan (docs/mobile/03-screen-inventory.md §M). No card
// details here — see apps/api/README.md and
// docs/mobile/07-open-questions-gaps.md for why: there's no payment
// gateway wired up yet, so this activates a subscription directly rather
// than pretending to process a real card.
export const subscribeSchema = z.object({
  // String id (uuid is only the default generator; seed uses "basic"/"pro").
  // See payments.schema.ts's referenceId comment — found 31 Aug 2026.
  planId: z.string().min(1).max(191),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
