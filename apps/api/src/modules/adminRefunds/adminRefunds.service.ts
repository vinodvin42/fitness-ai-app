import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { getRazorpayClient, isRazorpayConfigured } from "../../lib/razorpayClient";
import { createActionItem } from "../../lib/adminActionQueue";
import { CreateRefundInput, ListRefundsQuery } from "./adminRefunds.schema";

/**
 * Module 06.04 — Refunds (docs/admin/03-screen-inventory.md), added 31 Aug
 * 2026 — the refund entity adminPayments.service.ts flagged as "no producer
 * anywhere". Now there's a real one: an admin-initiated refund against a
 * real captured `Payment`.
 *
 * When Razorpay is configured and the payment carries a provider payment id,
 * the refund is issued through Razorpay's real refund API and lands
 * `processed` with a `providerRefundId`, plus a real `Expense` row (category
 * `refund`) so it flows into Module 10 Finance's ledger. Otherwise it's
 * recorded `pending` — honest, since no funds can actually move without a
 * live gateway (same "unconfigured means quietly degraded, never faked"
 * pattern as the rest of the payments integration). Partial and repeat
 * refunds are allowed up to the payment's captured amount.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

const REFUND_NOT_AVAILABLE = ["gatewayHealth"];

type RefundRow = {
  id: string;
  paymentId: string;
  amountCents: number;
  reason: string | null;
  status: string;
  providerRefundId: string | null;
  createdAt: Date;
  processedAt: Date | null;
  payment: { currency: string; user: { fullName: string; email: string } };
};

function toItem(r: RefundRow) {
  return {
    id: r.id,
    paymentId: r.paymentId,
    amountCents: r.amountCents,
    currency: r.payment.currency,
    reason: r.reason,
    status: r.status,
    providerRefundId: r.providerRefundId,
    userName: r.payment.user.fullName,
    userEmail: r.payment.user.email,
    createdAt: r.createdAt,
    processedAt: r.processedAt,
  };
}

export async function listRefunds(query: ListRefundsQuery) {
  const rows = (await prisma.refund.findMany({
    where: query.status ? { status: query.status } : undefined,
    include: { payment: { select: { currency: true, user: { select: { fullName: true, email: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  })) as RefundRow[];

  const all = (await prisma.refund.findMany({ select: { amountCents: true, status: true } })) as {
    amountCents: number;
    status: string;
  }[];

  return {
    refunds: rows.map(toItem),
    summary: {
      totalCount: all.length,
      processedCents: all.filter((r) => r.status === "processed").reduce((s, r) => s + r.amountCents, 0),
      pendingCents: all.filter((r) => r.status === "pending").reduce((s, r) => s + r.amountCents, 0),
    },
    notAvailable: REFUND_NOT_AVAILABLE,
  };
}

type LockedPaymentRow = {
  id: string;
  userId: string;
  status: string;
  amountCents: number;
  currency: string;
  providerPaymentId: string | null;
};

/**
 * Real over-refund race (found during a later bug-hunt pass, 15 Sep 2026):
 * the exact "read-then-write, not atomic" class already fixed five times
 * elsewhere in this codebase (payments.service.ts's activatePayment,
 * nutrition.service.ts's confirmFoodEstimate, adminInfluencers.service.ts's
 * markPayoutPaid, adminSettlements' settleCoach-adjacent work, plans.
 * service.ts's decideRecommendation) — but this one caps a running SUM
 * across every non-failed Refund on a Payment, not a single row's status,
 * so a conditional `updateMany` (this codebase's usual fix) can't express
 * it. Two concurrent refund requests against the same Payment (two admins
 * working the same ticket, or a double-click on "Issue Refund") could each
 * read the same `alreadyRefunded` total from their own snapshot, both pass
 * the `amountCents > remaining` check below, and both go on to call
 * Razorpay's real refund API — actually moving more real money out than
 * the payment ever collected, not just corrupting an internal counter.
 *
 * Fixed with a real row lock: `SELECT ... FOR UPDATE` on the Payment row
 * inside a transaction serializes the read-total-then-claim step, and the
 * claim itself (creating a `pending` Refund row for the requested amount)
 * happens inside that same locked transaction — so a second concurrent
 * request blocks until the first commits, then re-reads a total that
 * already includes it. The actual Razorpay call happens AFTER the
 * transaction commits (an external HTTP call has no business holding a DB
 * row lock open) and reconciles onto the already-reserved row rather than
 * creating a second one.
 */
export async function createRefund(actorAdminId: string, paymentId: string, input: CreateRefundInput) {
  const { payment, reserved } = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<LockedPaymentRow[]>`
      SELECT id, "userId", status, "amountCents", currency, "providerPaymentId"
      FROM "payments" WHERE id = ${paymentId} FOR UPDATE
    `;
    const lockedPayment = locked[0];
    if (!lockedPayment) {
      throw new ApiHttpError(404, "payment_not_found", "Payment not found");
    }
    if (lockedPayment.status !== "paid") {
      throw new ApiHttpError(409, "payment_not_captured", "Only a captured payment can be refunded");
    }

    const existingRefunds = await tx.refund.findMany({
      where: { paymentId, status: { not: "failed" } },
      select: { amountCents: true },
    });
    const alreadyRefunded = existingRefunds.reduce((s, r) => s + r.amountCents, 0);
    const remaining = lockedPayment.amountCents - alreadyRefunded;
    if (input.amountCents > remaining) {
      throw new ApiHttpError(
        422,
        "over_refund",
        `Refund exceeds the refundable amount (${remaining} ${lockedPayment.currency} remaining)`,
      );
    }

    const reservedRefund = await tx.refund.create({
      data: {
        paymentId,
        amountCents: input.amountCents,
        reason: input.reason ?? null,
        status: "pending",
        note: input.note ?? null,
      },
    });

    return { payment: lockedPayment, reserved: reservedRefund };
  });

  // Try the real gateway refund when possible; otherwise leave the
  // already-reserved row `pending`.
  let status: "processed" | "pending" = "pending";
  let providerRefundId: string | null = null;
  const now = new Date();

  if (isRazorpayConfigured() && payment.providerPaymentId) {
    try {
      const razorpay = getRazorpayClient();
      const refund = await razorpay.payments.refund(payment.providerPaymentId, { amount: input.amountCents });
      status = "processed";
      providerRefundId = (refund as { id?: string }).id ?? null;
    } catch (err) {
      // A gateway failure is recorded as a real `failed` refund (reconciled
      // onto the already-reserved row, not a second one), not swallowed —
      // this also frees up the reserved amount for a future retry, since
      // "failed" refunds are excluded from the alreadyRefunded sum above.
      const failed = await prisma.refund.update({
        where: { id: reserved.id },
        data: { status: "failed" },
      });
      await recordAudit({
        actorAdminId,
        action: "refund.failed",
        entityType: "Refund",
        entityId: failed.id,
        metadata: { paymentId, amountCents: input.amountCents, error: (err as Error).message },
      });
      throw new ApiHttpError(502, "gateway_refund_failed", "The payment gateway rejected this refund");
    }
  }

  const refund = await prisma.refund.update({
    where: { id: reserved.id },
    data: { status, providerRefundId, processedAt: status === "processed" ? now : null },
  });

  if (status === "processed") {
    await prisma.expense.create({
      data: {
        category: "refund",
        description: `Refund — payment ${paymentId.slice(0, 8)}`,
        amountCents: input.amountCents,
        status: "paid",
        incurredAt: now,
        recordedByAdminId: actorAdminId,
        paidAt: now,
        notes: input.reason ?? null,
      },
    });
  }

  await recordAudit({
    actorAdminId,
    action: status === "processed" ? "refund.processed" : "refund.recorded",
    entityType: "Refund",
    entityId: refund.id,
    metadata: { paymentId, amountCents: input.amountCents, status },
  });

  // Admin Action Required queue (R2 Wave 1, 20 Sep 2026) — only a refund
  // that landed genuinely `pending` (no live gateway to actually move the
  // money) needs a human admin to follow up; a `processed` refund already
  // completed the real action there is to take, so it doesn't belong in
  // an "action required" queue at all.
  if (status === "pending") {
    await createActionItem({
      type: "refund_impact",
      entityType: "Refund",
      entityId: refund.id,
      severity: "medium",
      metadata: { paymentId, amountCents: input.amountCents },
    });
  }

  return refund;
}
