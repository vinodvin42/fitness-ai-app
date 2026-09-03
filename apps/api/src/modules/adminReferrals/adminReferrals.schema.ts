import { z } from "zod";

// 07.03 Referrals (docs/admin/03-screen-inventory.md §07.03) — the
// `Referral` model (prisma/schema.prisma, `apps/api/src/modules/referrals`)
// has exactly 3 real columns: referrerId, refereeId, createdAt. No status,
// no channel, no code snapshot on the row itself (the code lives on
// `User.referralCode` and can change independently of history — this
// schema's `search` therefore matches the referrer/referee's live
// name/email, not a per-row code). See adminReferrals.service.ts's own
// doc comment for the full real-vs-not breakdown.
export const listAdminReferralsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type ListAdminReferralsQuery = z.infer<typeof listAdminReferralsQuerySchema>;
