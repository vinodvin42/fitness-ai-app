import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { assertHighImpactConfirmed } from "../../lib/highImpactAction";

/**
 * A-M3 — "Payout run: approve professional earnings and creator
 * commissions, create payout batch, mark paid / failed".
 *
 * The handoff records the symptom precisely: "Rows say 'Await approval'
 * with no action". Before R1 the only payout action in the codebase was
 * `POST /admin/payouts/:id/mark-paid`, one influencer row at a time,
 * with no approval step and no failure state — so a finance admin could
 * mark money paid that nobody had approved, and could not record that a
 * payment had bounced.
 *
 * Creating a batch is high-impact under BR-ADM-005: it moves real money
 * to real people. Marking rows paid or failed afterwards is a recording
 * action on an already-approved batch, so it takes a reason but not a
 * second typed confirmation — making a finance admin retype RESOLVE for
 * every bank acknowledgement would train them to type it without
 * reading, which is the opposite of what the rule is for.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

export type PayoutRunKind = "professional_earning" | "creator_commission";

/**
 * What a run WOULD pay, without creating anything — BR-ADM-005's
 * "impact preview". The admin console shows this before the reason and
 * confirmation step, so the person approving knows the size of what they
 * are approving.
 */
export async function previewPayoutRun(kind: PayoutRunKind) {
  if (kind === "creator_commission") {
    const rows = await prisma.creatorCommission.findMany({
      where: { status: "approved", payoutBatchId: null },
      select: { id: true, influencerId: true, commissionCents: true },
    });
    return {
      kind,
      itemCount: rows.length,
      totalCents: rows.reduce((s, r) => s + r.commissionCents, 0),
      payeeCount: new Set(rows.map((r) => r.influencerId)).size,
    };
  }

  const rows = await prisma.coachSettlement.findMany({
    where: { status: "approved", payoutBatchId: null },
    select: { id: true, professionalId: true, netCents: true },
  });
  return {
    kind,
    itemCount: rows.length,
    totalCents: rows.reduce((s, r) => s + r.netCents, 0),
    payeeCount: new Set(rows.map((r) => r.professionalId)).size,
  };
}

/**
 * Approves an eligible earning, moving it to `approved` so a payout run
 * can pick it up. This is the step the handoff says was missing.
 */
export async function approveEarning(adminId: string, settlementId: string, reason: string) {
  const settlement = await prisma.coachSettlement.findUnique({ where: { id: settlementId } });
  if (!settlement) throw new ApiHttpError(404, "settlement_not_found", "Settlement not found");
  if (settlement.status !== "eligible" && settlement.status !== "pending") {
    throw new ApiHttpError(409, "not_approvable", `A ${settlement.status} settlement cannot be approved`);
  }

  const updated = await prisma.coachSettlement.update({
    where: { id: settlementId },
    data: { status: "approved", approvedAt: new Date() },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "earning.approved",
    entityType: "CoachSettlement",
    entityId: settlementId,
    ruleId: "BR-COM-012",
    stateBefore: { status: settlement.status },
    stateAfter: { status: "approved" },
    metadata: { reason, netCents: settlement.netCents },
  });

  return updated;
}

/**
 * Assembles and starts a batch. Claims its rows by stamping
 * `payoutBatchId` in the same update that moves them to `pending`
 * (the spec's PAYOUT_PENDING), with `payoutBatchId: null` in the where
 * clause — so two admins starting a run at the same moment cannot both
 * claim the same row. Same conditional-updateMany discipline this
 * codebase already uses for activation and refund races.
 */
export async function createPayoutRun(
  adminId: string,
  kind: PayoutRunKind,
  input: { reason?: string | null; confirmation?: string | null; note?: string | null },
) {
  const reason = assertHighImpactConfirmed(input);
  const preview = await previewPayoutRun(kind);
  if (preview.itemCount === 0) {
    throw new ApiHttpError(422, "nothing_to_pay", "No approved, unbatched rows to pay");
  }

  const batch = await prisma.payoutBatch.create({
    data: {
      kind,
      createdByAdminId: adminId,
      status: "processing",
      itemCount: preview.itemCount,
      totalCents: preview.totalCents,
      reason,
      note: input.note ?? null,
    },
  });

  const claimed =
    kind === "creator_commission"
      ? await prisma.creatorCommission.updateMany({
          where: { status: "approved", payoutBatchId: null },
          data: { payoutBatchId: batch.id },
        })
      : await prisma.coachSettlement.updateMany({
          where: { status: "approved", payoutBatchId: null },
          data: { payoutBatchId: batch.id, status: "pending" },
        });

  // Another run may have claimed some rows between the preview and the
  // claim. Restate the batch to what it actually holds rather than
  // leaving the optimistic preview figure on it.
  const finalBatch =
    claimed.count === preview.itemCount
      ? batch
      : await prisma.payoutBatch.update({
          where: { id: batch.id },
          data: { itemCount: claimed.count },
        });

  await recordAudit({
    actorAdminId: adminId,
    action: "payout_batch.created",
    entityType: "PayoutBatch",
    entityId: batch.id,
    ruleId: "BR-ADM-005",
    stateAfter: { status: "processing", itemCount: claimed.count, totalCents: preview.totalCents },
    metadata: { kind, reason },
  });

  return finalBatch;
}

/**
 * Records the outcome of a batch once the bank or payout provider has
 * answered. `failedIds` names the rows that bounced; everything else in
 * the batch is marked paid.
 */
export async function settlePayoutRun(
  adminId: string,
  batchId: string,
  input: { reason: string; failedIds?: string[]; failureReason?: string | null },
) {
  const batch = await prisma.payoutBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new ApiHttpError(404, "payout_batch_not_found", "Payout batch not found");
  if (batch.status !== "processing") {
    throw new ApiHttpError(409, "batch_not_processing", `A ${batch.status} batch cannot be settled again`);
  }

  const failedIds = input.failedIds ?? [];
  const now = new Date();
  const failureReason = input.failureReason ?? "Payout rejected by the payment provider";

  if (batch.kind === "creator_commission") {
    const toPay = await prisma.creatorCommission.findMany({
      where: { payoutBatchId: batchId, id: { notIn: failedIds }, status: { notIn: ["disputed", "reversed"] } },
      select: { id: true, influencerId: true, commissionCents: true },
    });
    await prisma.creatorCommission.updateMany({
      where: { payoutBatchId: batchId, id: { notIn: failedIds }, status: { notIn: ["disputed", "reversed"] } },
      data: { status: "paid", paidAt: now },
    });
    // Spec §11 `commission.paid`, one per commission rather than one per
    // batch: a creator asking "when was I paid for this conversion"
    // needs a row about that conversion, not about a batch they were in.
    for (const c of toPay) {
      await recordAudit({
        actorAdminId: adminId,
        action: "commission.paid",
        entityType: "CreatorCommission",
        entityId: c.id,
        ruleId: "BR-COM-012",
        stateBefore: { status: "approved" },
        stateAfter: { status: "paid" },
        metadata: { batchId, influencerId: c.influencerId, commissionCents: c.commissionCents },
      });
    }
    if (failedIds.length > 0) {
      // A failed commission goes back to `approved`, not to a failed
      // state: the money is still owed and must be picked up by the next
      // run. The failure belongs to the batch, not to the entitlement.
      await prisma.creatorCommission.updateMany({
        where: { payoutBatchId: batchId, id: { in: failedIds } },
        data: { status: "approved", payoutBatchId: null },
      });
    }
  } else {
    await prisma.coachSettlement.updateMany({
      where: { payoutBatchId: batchId, id: { notIn: failedIds } },
      data: { status: "paid", paidAt: now },
    });
    if (failedIds.length > 0) {
      await prisma.coachSettlement.updateMany({
        where: { payoutBatchId: batchId, id: { in: failedIds } },
        data: { status: "payout_failed", payoutFailureReason: failureReason },
      });
    }
  }

  const updated = await prisma.payoutBatch.update({
    where: { id: batchId },
    data: {
      status: failedIds.length > 0 ? "partially_failed" : "completed",
      processedAt: now,
    },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: failedIds.length > 0 ? "payout.failed" : "payout.paid",
    entityType: "PayoutBatch",
    entityId: batchId,
    ruleId: "BR-COM-012",
    stateBefore: { status: "processing" },
    stateAfter: { status: updated.status, failedCount: failedIds.length },
    metadata: { reason: input.reason, failureReason: failedIds.length > 0 ? failureReason : null },
  });

  return updated;
}

export async function listPayoutRuns(kind?: PayoutRunKind) {
  return prisma.payoutBatch.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
