import type { PurchaseRecord } from "../api/checkout";

/**
 * Figma payments/10 "Every charge and refund" (24 Oct 2026): one list of
 * money out (a paid purchase) and money back (its refund), newest first.
 * A refund is its own row, dated when it was processed (or requested, while
 * pending), so it sits where it happened instead of under the old charge.
 * Pure (tests/moneyTimeline.check.cjs).
 */
export type MoneyEntry = {
  key: string;
  kind: "charge" | "refund";
  /** ISO time the row is dated by. */
  at: string;
  amountCents: number;
  purchase: PurchaseRecord;
  /** Refund rows only. */
  refundStatus?: "pending" | "processed" | "failed";
};

const asRefundStatus = (s: string): MoneyEntry["refundStatus"] => (s === "processed" || s === "failed" ? s : "pending");

export function moneyTimeline(purchases: readonly PurchaseRecord[]): MoneyEntry[] {
  const out: MoneyEntry[] = [];
  for (const p of purchases) {
    out.push({ key: `charge:${p.id}`, kind: "charge", at: p.createdAt, amountCents: p.amountCents, purchase: p });
    if (p.refund) {
      out.push({
        key: `refund:${p.id}`,
        kind: "refund",
        at: p.refund.processedAt ?? p.refund.requestedAt,
        // The API's refunded total: 0 when the refund failed (nothing came back).
        amountCents: p.refund.refundedCents,
        purchase: p,
        refundStatus: asRefundStatus(p.refund.status),
      });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Refunds still on their way, for the card at the top. */
export function refundsInProgress(purchases: readonly PurchaseRecord[]): PurchaseRecord[] {
  return purchases.filter((p) => p.refund && asRefundStatus(p.refund.status) === "pending");
}
