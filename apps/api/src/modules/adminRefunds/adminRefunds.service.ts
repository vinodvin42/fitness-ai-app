import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { getRazorpayClient, isRazorpayConfigured } from "../../lib/razorpayClient";
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

type PaymentForRefund = {
  id: string;
  userId: string;
  status: string;
  amountCents: number;
  currency: string;
  providerPaymentId: string | null;
  refunds: { amountCents: number; status: string }[];
};

export async function createRefund(actorAdminId: string, paymentId: string, input: CreateRefundInput) {
  const payment = (await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { refunds: { select: { amountCents: true, status: true } } },
  })) as PaymentForRefund | null;

  if (!payment) {
    throw new ApiHttpError(404, "payment_not_found", "Payment not found");
  }
  if (payment.status !== "paid") {
    throw new ApiHttpError(409, "payment_not_captured", "Only a captured payment can be refunded");
  }

  const alreadyRefunded = payment.refunds
    .filter((r) => r.status !== "failed")
    .reduce((s, r) => s + r.amountCents, 0);
  const remaining = payment.amountCents - alreadyRefunded;
  if (input.amountCents > remaining) {
    throw new ApiHttpError(
      422,
      "over_refund",
      `Refund exceeds the refundable amount (${remaining} ${payment.currency} remaining)`,
    );
  }

  // Try the real gateway refund when possible; otherwise record it pending.
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
      // A gateway failure is recorded as a real `failed` refund, not swallowed.
      const failed = await prisma.refund.create({
        data: {
          paymentId,
          amountCents: input.amountCents,
          reason: input.reason ?? null,
          status: "failed",
          note: input.note ?? null,
        },
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

  const refund = await prisma.refund.create({
    data: {
      paymentId,
      amountCents: input.amountCents,
      reason: input.reason ?? null,
      status,
      providerRefundId,
      note: input.note ?? null,
      processedAt: status === "processed" ? now : null,
    },
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

  return refund;
}
