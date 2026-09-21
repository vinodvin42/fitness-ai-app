import { prisma } from "../../db/prisma";
import { hashPassword } from "../../lib/password";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import {
  CreateInfluencerInput,
  CreatePayoutInput,
  ListInfluencersQuery,
  SetPortalPasswordInput,
  UpdateInfluencerInput,
} from "./adminInfluencers.schema";

/**
 * Module 07.01/07.02 — Influencers + 10.07 Influencer Payouts (docs/admin/
 * 03-screen-inventory.md), added 31 Aug 2026 — the Growth/Finance modules
 * the roadmap left blocked on a missing `Influencer` entity. That entity is
 * now built: a real admin-managed influencer directory plus admin-recorded
 * payouts.
 *
 * **Honest boundary:** this build has no campaign/attribution tracking —
 * nothing anywhere records which signups or purchases an influencer drove
 * (there's no `Campaign`, no attribution join). So `commissionPct` is real
 * metadata but is NOT auto-applied to any revenue, and payouts are
 * admin-entered amounts, not computed from attributed revenue × rate — the
 * same "no fabricated computation over data that doesn't exist" discipline
 * every other module in this build uses. Marking a payout paid records a
 * real `Expense` row (category `influencer_payout`) so it flows into Module
 * 10 Finance's ledger.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

type PayoutRow = { amountCents: number; status: string };
type InfluencerRow = {
  id: string;
  name: string;
  email: string | null;
  handle: string | null;
  platform: string | null;
  commissionPct: number;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  payouts: PayoutRow[];
};

function toListItem(i: InfluencerRow) {
  const paidCents = i.payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountCents, 0);
  const pendingCents = i.payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amountCents, 0);
  return {
    id: i.id,
    name: i.name,
    email: i.email,
    handle: i.handle,
    platform: i.platform,
    commissionPct: i.commissionPct,
    status: i.status,
    paidCents,
    pendingCents,
    payoutCount: i.payouts.length,
    createdAt: i.createdAt,
  };
}

export async function listInfluencers(query: ListInfluencersQuery) {
  const rows = (await prisma.influencer.findMany({
    include: { payouts: { select: { amountCents: true, status: true } } },
    orderBy: { createdAt: "desc" },
  })) as InfluencerRow[];

  const filtered = rows.filter(
    (r) =>
      (query.status ? r.status === query.status : true) &&
      (query.search
        ? [r.name, r.email, r.handle].some((f) => f?.toLowerCase().includes(query.search!.toLowerCase()))
        : true),
  );

  const items = filtered.map(toListItem);
  return {
    influencers: items,
    counts: {
      total: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      totalPaidCents: items.reduce((s, i) => s + i.paidCents, 0),
      totalPendingCents: items.reduce((s, i) => s + i.pendingCents, 0),
    },
  };
}

type PayoutDetailRow = {
  id: string;
  amountCents: number;
  periodLabel: string;
  status: string;
  paidAt: Date | null;
  note: string | null;
  createdAt: Date;
};
type InfluencerDetailRow = Omit<InfluencerRow, "payouts"> & { payouts: PayoutDetailRow[] };

async function getInfluencerOrThrow(id: string): Promise<InfluencerDetailRow> {
  const influencer = await prisma.influencer.findUnique({
    where: { id },
    include: { payouts: { orderBy: { createdAt: "desc" } } },
  });
  if (!influencer) {
    throw new ApiHttpError(404, "influencer_not_found", "Influencer not found");
  }
  return influencer as InfluencerDetailRow;
}

export async function getInfluencer(id: string) {
  const i = await getInfluencerOrThrow(id);
  return {
    id: i.id,
    name: i.name,
    email: i.email,
    handle: i.handle,
    platform: i.platform,
    commissionPct: i.commissionPct,
    status: i.status,
    notes: i.notes,
    createdAt: i.createdAt,
    payouts: i.payouts.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      periodLabel: p.periodLabel,
      status: p.status,
      paidAt: p.paidAt,
      note: p.note,
      createdAt: p.createdAt,
    })),
    notAvailable: ["referralFunnel", "acquisitionChannelSplit"],
  };
}

export async function createInfluencer(actorAdminId: string, input: CreateInfluencerInput) {
  const influencer = await prisma.influencer.create({
    data: {
      name: input.name,
      email: input.email ?? null,
      handle: input.handle ?? null,
      platform: input.platform ?? null,
      commissionPct: input.commissionPct,
      notes: input.notes ?? null,
    },
  });
  await recordAudit({
    actorAdminId,
    action: "influencer.create",
    entityType: "Influencer",
    entityId: influencer.id,
    metadata: { name: input.name },
  });
  return influencer;
}

export async function updateInfluencer(actorAdminId: string, id: string, input: UpdateInfluencerInput) {
  await getInfluencerOrThrow(id);
  const influencer = await prisma.influencer.update({ where: { id }, data: input });
  await recordAudit({
    actorAdminId,
    action: "influencer.update",
    entityType: "Influencer",
    entityId: id,
    metadata: input,
  });
  return influencer;
}

export async function createPayout(actorAdminId: string, influencerId: string, input: CreatePayoutInput) {
  await getInfluencerOrThrow(influencerId);
  const payout = await prisma.influencerPayout.create({
    data: {
      influencerId,
      amountCents: input.amountCents,
      periodLabel: input.periodLabel,
      note: input.note ?? null,
    },
  });
  await recordAudit({
    actorAdminId,
    action: "influencer_payout.create",
    entityType: "InfluencerPayout",
    entityId: payout.id,
    metadata: { influencerId, amountCents: input.amountCents, periodLabel: input.periodLabel },
  });
  return payout;
}

/**
 * Creator Portal (R2 Wave 5, 21 Sep 2026) — the real "Set Portal Password"
 * admin action named in this wave's brief: an `Influencer` starts with NO
 * self-service login at all (`passwordHash` null, see the model's own doc
 * comment); this is the only way one is ever granted, deliberately
 * admin-initiated rather than a self-signup/invite-link flow — the same
 * bootstrapping decision documented in docs/admin/07-open-questions-gaps.md's
 * 21 Sep 2026 entry. Requires the influencer to already have a real email
 * on file (the Creator Portal logs in by email+password, same as every
 * other identity in this codebase) — `email` is optional on `Influencer`
 * since most rows are pure admin bookkeeping with no portal need, so this
 * is the one real precondition worth a clear error rather than silently
 * creating a password nobody can ever log in with.
 */
export async function setInfluencerPortalPassword(
  actorAdminId: string,
  influencerId: string,
  input: SetPortalPasswordInput,
) {
  const influencer = await getInfluencerOrThrow(influencerId);
  if (!influencer.email) {
    throw new ApiHttpError(
      422,
      "influencer_missing_email",
      "This influencer has no email on file — add one before granting portal access",
    );
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.influencer.update({ where: { id: influencerId }, data: { passwordHash } });

  await recordAudit({
    actorAdminId,
    action: "influencer.set_portal_password",
    entityType: "Influencer",
    entityId: influencerId,
  });

  return { ok: true as const };
}

/**
 * Same read-then-write race already found and fixed in payments.service.ts's
 * activatePayment() and nutrition.service.ts's confirmFoodEstimate() (see
 * those functions' own comments): a plain `if (p.status === "paid") throw`
 * guard reads this call's own already-fetched snapshot, so two concurrent
 * calls for the same payout (an admin double-clicking "Mark Paid", or two
 * admin tabs open on the same row — InfluencerPayout has no unique
 * constraint of its own to fall back on, unlike CoachSettlement's
 * `(professionalId, periodStart)`) can both pass the guard and both reach
 * the unconditional `prisma.expense.create()` below, recording the same
 * payout twice in Finance's ledger and double-counting it in every
 * aggregate that sums `Expense` (Dashboard's expensesMtdCents/cashBalance,
 * the revenue waterfall's coachSettlementCents-style totals, Payables).
 * Fixed the same way: `updateMany` with a `status: { not: "paid" }` filter
 * makes the claim atomic — only the caller whose update actually affects a
 * row goes on to create the Expense.
 */
export async function markPayoutPaid(actorAdminId: string, payoutId: string) {
  const payout = await prisma.influencerPayout.findUnique({
    where: { id: payoutId },
    include: { influencer: { select: { name: true } } },
  });
  const p = payout as
    | { id: string; status: string; amountCents: number; periodLabel: string; note: string | null; influencer: { name: string } }
    | null;
  if (!p) {
    throw new ApiHttpError(404, "payout_not_found", "Payout not found");
  }
  if (p.status === "paid") {
    throw new ApiHttpError(409, "already_paid", "This payout is already marked paid");
  }

  const now = new Date();
  const claimed = await prisma.influencerPayout.updateMany({
    where: { id: payoutId, status: { not: "paid" } },
    data: { status: "paid", paidAt: now },
  });
  if (claimed.count === 0) {
    // A concurrent call already claimed it between our read above and now.
    throw new ApiHttpError(409, "already_paid", "This payout is already marked paid");
  }
  const updated = (await prisma.influencerPayout.findUnique({ where: { id: payoutId } })) as {
    id: string;
    status: string;
    amountCents: number;
    periodLabel: string;
    note: string | null;
    paidAt: Date | null;
  };

  await prisma.expense.create({
    data: {
      category: "influencer_payout",
      description: `Influencer payout — ${p.influencer.name} (${p.periodLabel})`,
      amountCents: p.amountCents,
      status: "paid",
      incurredAt: now,
      recordedByAdminId: actorAdminId,
      paidAt: now,
      notes: p.note ?? null,
    },
  });

  await recordAudit({
    actorAdminId,
    action: "influencer_payout.paid",
    entityType: "InfluencerPayout",
    entityId: payoutId,
    metadata: { amountCents: p.amountCents },
  });

  return updated;
}
