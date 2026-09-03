import { prisma } from "../../db/prisma";
import { ListAdminReferralsQuery } from "./adminReferrals.schema";

/**
 * Module 07 — Growth, 07.03 Referrals only (docs/admin/03-screen-inventory.md
 * §07.03), added 25 Aug 2026 — the first admin surface over the real
 * `Referral` model (Phase 4's §O "Refer & Invite",
 * `apps/api/src/modules/referrals`), which until now had no admin-side view
 * at all. Picked as this cycle's slice because, at the time this was
 * written, it was one of the few genuinely unblocked pieces left anywhere
 * in the console: most other remaining gaps (04.03, 05.04/05.05,
 * 06.01/06.04/06.05, 07.01/07.02/07.04, 08.02–08.04, 12.02, 12.04–12.08)
 * needed either a brand-new entity with no producer anywhere yet, or a
 * product/design decision this build couldn't make unilaterally — 04.03
 * and 05.05 have since turned out to be resolvable too (see
 * adminRelationships.service.ts and adminPrograms.service.ts) — see
 * `docs/platform/roadmap.md`'s Phase 7 section and this cycle's own status
 * review for the full list as of this module's own build. `Referral` already exists,
 * is already being written to by real mobile signups, and simply has no
 * screen reading it back out yet.
 *
 * **What's real vs. honestly not modeled**, against 07.03's fuller spec ("a
 * funnel visualization ... alongside referral economics"):
 * - The `Referral` row itself is real and complete: `referrerId`,
 *   `refereeId`, `createdAt` — every row here is one genuine signup
 *   attributed to another user's code (`referrals.service.ts`'s
 *   `redeemReferralCode`). This screen is the first place in the console
 *   that lists them across every user, rather than one user's own count on
 *   their Profile (Module 02's `["referrals","me"]` — a scoped count only).
 * - **The funnel is NOT built.** A real conversion funnel needs multiple
 *   measurable stages (e.g. code shared → link clicked → signed up →
 *   converted); this build only ever writes ONE event — a completed
 *   `Referral` row — the moment a valid code redeems at signup. A bad or
 *   mistyped code is silently ignored with no record at all (see
 *   `redeemReferralCode`'s own doc comment), so there's no "attempted but
 *   failed" stage either. A single-stage bar chart would misrepresent a
 *   funnel that doesn't exist in this data — named in `notAvailable`
 *   rather than faked as a 2-bar funnel.
 * - **Referral economics are NOT built.** No reward/bonus/credit field
 *   exists anywhere for either the referrer or the referee — see the
 *   `Referral` model's own doc comment in `prisma/schema.prisma` for why
 *   ("the design's 'you get / friend gets' rewards grid needs a real
 *   referral-bonus decision this pass can't make"). Nothing here shows a
 *   dollar figure for a reward that was never defined.
 * - What IS real and useful instead: a filterable Directory of every
 *   referral (referrer + referee identity, date), a Total Referrals /
 *   Unique Referrers stats pair computed from the same search+date-scoped
 *   set the table shows, and a real Top Referrers leaderboard (a genuine
 *   `groupBy` over `referrerId`, not a guess) — the actual growth signal
 *   this data can honestly support.
 * - Read-only, like Module 02 Users and Module 06 Commerce — a `Referral`
 *   row is a historical attribution fact created once at signup; there is
 *   no legitimate admin edit to make to one.
 *
 * Deliberately does NOT import `Referral`/`User` as Prisma model types —
 * same reasoning as every other admin service file this build (the
 * un-generated `@prisma/client` stub has no real model exports).
 */

type ReferralRow = {
  id: string;
  referrerId: string;
  refereeId: string;
  createdAt: Date;
  referrer: { id: string; fullName: string; email: string };
  referee: { id: string; fullName: string; email: string };
};

function toListItem(r: ReferralRow) {
  return {
    id: r.id,
    referrerId: r.referrer.id,
    referrerName: r.referrer.fullName,
    referrerEmail: r.referrer.email,
    refereeId: r.referee.id,
    refereeName: r.referee.fullName,
    refereeEmail: r.referee.email,
    createdAt: r.createdAt,
  };
}

export async function listReferrals(query: ListAdminReferralsQuery) {
  const where: Record<string, unknown> = {};
  if (query.startDate || query.endDate) {
    where.createdAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }
  if (query.search) {
    where.OR = [
      { referrer: { fullName: { contains: query.search, mode: "insensitive" } } },
      { referrer: { email: { contains: query.search, mode: "insensitive" } } },
      { referee: { fullName: { contains: query.search, mode: "insensitive" } } },
      { referee: { email: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const [rows, grouped] = await Promise.all([
    prisma.referral.findMany({
      where,
      include: {
        referrer: { select: { id: true, fullName: true, email: true } },
        referee: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Real leaderboard — a genuine aggregate over the same scoped set, not
    // a guess. `_count` here counts rows per `referrerId` group.
    prisma.referral.groupBy({
      by: ["referrerId"],
      where,
      _count: { _all: true },
      orderBy: { _count: { referrerId: "desc" } },
      take: 5,
    }),
  ]);

  const referrals = rows as ReferralRow[];
  const groups = grouped as Array<{ referrerId: string; _count: { _all: number } }>;

  const referrerIds = groups.map((g) => g.referrerId);
  const referrers =
    referrerIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: referrerIds } }, select: { id: true, fullName: true, email: true } })
      : [];
  const referrerById = new Map((referrers as Array<{ id: string; fullName: string; email: string }>).map((u) => [u.id, u]));

  const topReferrers = groups.map((g) => {
    const user = referrerById.get(g.referrerId);
    return {
      userId: g.referrerId,
      name: user?.fullName ?? "Unknown",
      email: user?.email ?? "",
      referralCount: g._count._all,
    };
  });

  const uniqueReferrers = new Set(referrals.map((r) => r.referrerId)).size;

  return {
    entries: referrals.map(toListItem),
    stats: {
      totalReferrals: referrals.length,
      uniqueReferrers,
    },
    topReferrers,
    // See this file's top comment: no funnel-stage data and no reward
    // amount exist anywhere in this build.
    notAvailable: ["referralFunnel", "referralRewards"],
  };
}
