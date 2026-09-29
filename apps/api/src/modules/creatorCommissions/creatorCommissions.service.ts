import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { ApiHttpError } from "../../middleware/errorHandler";

/**
 * Creator commission ledger — spec §10 "Creator commission":
 * PENDING_CALCULATION -> ELIGIBLE -> APPROVED -> PAID, and
 * any -> DISPUTED / REVERSED on refund or chargeback.
 *
 * This module exists because acceptance test 15 ("a refund or chargeback
 * moves the linked creator commission to DISPUTED / REVERSED") could not
 * pass before R1. There was no per-conversion commission record at all:
 * `InfluencerPayout` is an amount an admin types in for a period, which
 * no particular refund can be traced back to.
 *
 * BR-COM-012's "separate ledgers for payment, earning, commission, gym
 * commercial, marketing expense" is the reason this is its own table and
 * its own state machine rather than a status column on Payment. A
 * commission moving to `reversed` must never touch the Payment's own
 * status — the payment really did succeed, and §10 is explicit that
 * "no record may change another's state implicitly".
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

/** §10's allowed transitions, as data. Anything absent is refused. */
const ALLOWED: Record<string, readonly string[]> = {
  pending_calculation: ["eligible", "disputed", "reversed"],
  eligible: ["approved", "disputed", "reversed"],
  approved: ["paid", "disputed", "reversed"],
  paid: ["disputed", "reversed"],
  // Terminal-ish: a dispute resolves either by reinstating the
  // commission or by reversing it. Reversal itself is final.
  disputed: ["eligible", "reversed"],
  reversed: [],
};

function assertTransition(from: string, to: string) {
  if (!ALLOWED[from]?.includes(to)) {
    throw new ApiHttpError(
      409,
      "invalid_commission_transition",
      `A commission cannot move from ${from} to ${to}`,
    );
  }
}

/**
 * Resolves which creator, if any, a converting user is attributed to.
 *
 * Attribution runs User -> Touchpoint -> Campaign -> Influencer, which is
 * the same path the acquisition reporting already uses. The earliest
 * campaign touchpoint wins (first-touch), because a creator's claim is
 * that they *introduced* the user — a later touchpoint on someone else's
 * campaign does not retroactively take that away.
 */
export async function resolveAttributedInfluencer(userId: string) {
  const touchpoint = await prisma.touchpoint.findFirst({
    where: { userId, campaign: { influencerId: { not: null } } },
    orderBy: { occurredAt: "asc" },
    include: { campaign: { include: { influencer: true } } },
  });
  if (!touchpoint?.campaign?.influencer) return null;
  return { influencer: touchpoint.campaign.influencer, campaignId: touchpoint.campaign.id };
}

/**
 * Creates the commission for a captured payment, if the paying user is
 * attributed to a creator. Idempotent per payment — `CreatorCommission.
 * paymentId` is unique, and a second call returns the existing row
 * rather than throwing, because payment capture can legitimately be
 * retried.
 *
 * Lands directly in `eligible` rather than `pending_calculation` when the
 * rate is known: §10 lists PENDING_CALCULATION first, but it means "we
 * know money moved and have not worked out the cut yet", which is only
 * true when attribution is still unresolved.
 */
export async function createCommissionForPayment(paymentId: string) {
  const existing = await prisma.creatorCommission.findUnique({ where: { paymentId } });
  if (existing) return existing;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, userId: true, amountCents: true, status: true },
  });
  if (!payment) throw new ApiHttpError(404, "payment_not_found", "Payment not found");

  // Only a captured payment earns a commission. A `created` or `failed`
  // payment producing a commission row would be a phantom liability.
  if (payment.status !== "paid") return null;

  const attribution = await resolveAttributedInfluencer(payment.userId);
  if (!attribution) return null;

  const { influencer, campaignId } = attribution;
  const commissionPct = influencer.commissionPct;
  const commissionCents = Math.round((payment.amountCents * commissionPct) / 100);

  const commission = await prisma.creatorCommission.create({
    data: {
      influencerId: influencer.id,
      paymentId: payment.id,
      campaignId,
      commissionPct,
      grossCents: payment.amountCents,
      commissionCents,
      status: "eligible",
    },
  });

  await trackEvent(
    payment.userId,
    "commission.eligible",
    { commissionId: commission.id, influencerId: influencer.id, paymentId: payment.id },
    { ruleId: "BR-CRT-002", metadata: { commissionCents, commissionPct } },
  );

  return commission;
}

/**
 * Acceptance test 15. Called from the refund path — every refund, and
 * every chargeback-driven revoke, must run through here.
 *
 * A *partial* refund disputes rather than reverses: the conversion still
 * happened and part of the money stayed, so what the creator is owed is
 * a question for a human, not something to zero out automatically. A
 * full refund reverses outright — there is no conversion left to pay for.
 */
export async function applyRefundToCommission(params: {
  paymentId: string;
  refundId: string;
  refundedCents: number;
  actorAdminId?: string | null;
  reason?: string | null;
}) {
  const commission = await prisma.creatorCommission.findUnique({
    where: { paymentId: params.paymentId },
  });
  if (!commission) return null;
  if (commission.status === "reversed") return commission;

  const isFullRefund = params.refundedCents >= commission.grossCents;
  const next = isFullRefund ? "reversed" : "disputed";
  assertTransition(commission.status, next);

  const updated = await prisma.creatorCommission.update({
    where: { id: commission.id },
    data: {
      status: next,
      refundId: params.refundId,
      disputedReason:
        params.reason ??
        (isFullRefund
          ? "Converting payment fully refunded"
          : "Converting payment partially refunded — commission needs review"),
    },
  });

  await recordAudit({
    actorAdminId: params.actorAdminId ?? null,
    action: next === "reversed" ? "commission.reversed" : "commission.disputed",
    entityType: "CreatorCommission",
    entityId: commission.id,
    ruleId: "BR-COM-012",
    stateBefore: { status: commission.status },
    stateAfter: { status: next },
    metadata: {
      paymentId: params.paymentId,
      refundId: params.refundId,
      refundedCents: params.refundedCents,
      grossCents: commission.grossCents,
    },
  });

  return updated;
}

/** Admin approves an eligible commission, making it payable (A-M3). */
export async function approveCommission(adminId: string, commissionId: string, reason: string) {
  const commission = await prisma.creatorCommission.findUnique({ where: { id: commissionId } });
  if (!commission) throw new ApiHttpError(404, "commission_not_found", "Commission not found");
  assertTransition(commission.status, "approved");

  const updated = await prisma.creatorCommission.update({
    where: { id: commissionId },
    data: { status: "approved", approvedAt: new Date() },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "commission.approved",
    entityType: "CreatorCommission",
    entityId: commissionId,
    ruleId: "BR-COM-012",
    stateBefore: { status: commission.status },
    stateAfter: { status: "approved" },
    metadata: { reason, commissionCents: commission.commissionCents },
  });

  return updated;
}

export async function listCommissions(filter: { influencerId?: string; status?: string }) {
  return prisma.creatorCommission.findMany({
    where: {
      ...(filter.influencerId ? { influencerId: filter.influencerId } : {}),
      ...(filter.status ? { status: filter.status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
