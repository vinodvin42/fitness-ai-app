import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { ListPaymentsQuery } from "./adminPayments.schema";

/**
 * Module 06 — Commerce, 06.02 Transactions + 06.03 Payments only
 * (docs/admin/03-screen-inventory.md §06), added 22 Aug 2026 — the first
 * admin surface over the real `Payment` model (Phase 6's Razorpay
 * integration, `apps/api/src/modules/payments`), which until now was only
 * ever read back by Module 02's User Profile (a single user's own
 * Payments tab). This module is the console-wide, cross-user view: a
 * filterable Payments directory (06.03) and a per-payment Transaction
 * detail drill-down (06.02) — same Directory+Detail shape as Relationships
 * and Users, no `subNav` needed for a single top-level screen.
 *
 * **Why this slice and not the rest of Module 06**, against the Figma's 5
 * Commerce screens (06.01–06.05):
 * - **06.01 Subscriptions ("Revenue Dashboard")** needs a Gross → Discounts
 *   → Gateway fees → Refunds → Settlements → Net waterfall. `Discounts`
 *   needs a `Coupon` entity (not modeled, no discount-code flow anywhere
 *   in checkout), `Refunds` needs a `Refund` entity (not modeled — see
 *   adminDashboard.service.ts's own "openRefundRequests" note), and
 *   `Settlements` needs `CoachSettlement` (Module 10 Finance, not built).
 *   Rendering a waterfall with 3 of 6 stages fabricated would misrepresent
 *   real revenue, not just omit a column — worse than the usual
 *   `notAvailable` gap, so this screen is deferred whole rather than built
 *   as a partial chart.
 * - **06.04 Refunds** needs a `Refund` entity with no producer anywhere —
 *   no cancel-with-refund flow exists on `apps/api/src/modules/subscriptions`
 *   or `programPurchases`, and no mobile screen can request one. Same
 *   "empty by construction" reasoning as 04.03 Change/Intervention Queue
 *   and 05.04 Educational Content — not built even as an empty shell.
 * - **06.05 Pricing/Coupons**: deliberately left for its own future pass
 *   rather than folded in here, so this slice stayed the tight "money
 *   movement" pair (list + detail) rather than growing into unrelated
 *   plan/coupon management. **25 Aug 2026: the Plans half is now real**
 *   (`apps/api/src/modules/adminPlans`) — Coupons remains blocked, no
 *   `Coupon` entity exists anywhere (same gap as 06.01's Discounts stage);
 *   see that module's own doc comment for the full breakdown.
 *
 * **What's real vs. honestly not modeled in 06.02/06.03 themselves:**
 * - Every table column and detail field is a real `Payment` column, plus
 *   the paying `User` (name/email) and — new in this pass — a resolved
 *   human label for `referenceId` (the `SubscriptionPlan` or `Program`
 *   name), computed here rather than left as a bare UUID the way Module
 *   02's Payments tab currently shows it.
 * - The KPI row (Total Payments, Captured Revenue, Failed, Success Rate)
 *   is computed from the same search+date-range-scoped set the table
 *   shows, before the Status/Purpose filters narrow it further — same
 *   "counts are a stable superset of the filtered table" convention
 *   adminAccounts.service.ts's `listAdminUsers` and
 *   adminProfessionals.service.ts's `listProfessionals` already use.
 * - 06.03's spec'd "gateway health indicator" has no real backing metric
 *   anywhere (no uptime/incident tracking exists for the Razorpay
 *   integration) — named in `notAvailable` rather than faked as "healthy".
 * - 06.02's "ledger flow card (line items)" implies a multi-line
 *   breakdown (discounts/fees/tax) that doesn't exist for the same reason
 *   06.01's waterfall doesn't — this renders the one real line item this
 *   build actually tracks, the gross `amountCents` charged, not a
 *   fabricated multi-row ledger.
 * - 06.02's "audit trail/timeline" is real: the `AuditLog` rows
 *   `payments.service.ts` already writes (`payment.order_created`,
 *   `payment.captured`) for this exact `Payment` id, read back out here —
 *   same "the table already exists, this is the first screen to read it
 *   for this entity" precedent as Module 04's Relationship History tab.
 *   Note this trail can genuinely be incomplete for a `failed` payment: a
 *   client-side signature mismatch and a `payment.failed` webhook event
 *   both flip `Payment.status` to `failed` without their own audit entry
 *   (see payments.service.ts) — so a failed payment may show only its
 *   `order_created` entry. That's an accurate reflection of what this
 *   build actually records, not a bug in this read.
 * - Read-only: no admin action mutates a `Payment` here. Its status is
 *   entirely gateway/webhook-driven (`payments.service.ts`); an admin
 *   manually flipping it to `paid`/`failed`/"refunded" with no matching
 *   gateway event would fabricate a financial event, a meaningfully worse
 *   kind of gap than any deferred feature elsewhere in this build. Same
 *   "first module with no state-changing action" precedent as Module 02
 *   Users, for a stricter reason.
 *
 * Deliberately does NOT import `Payment`/`SubscriptionPlan`/`Program` as
 * Prisma model types — same reasoning as every other admin service file
 * this build (the un-generated `@prisma/client` stub has no real model
 * exports).
 */

type PaymentRow = {
  id: string;
  userId: string;
  provider: string;
  purpose: string;
  referenceId: string;
  amountCents: number;
  currency: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; fullName: string; email: string };
};

/**
 * Batch-resolves every row's `referenceId` (a `SubscriptionPlan.id`, a
 * `Program.id`, or — PAY-01, 5 Sep 2026 — a `ProfessionalServiceOffering.id`
 * for a booking payment, per `purpose`) into a human label in three
 * queries total, regardless of how many rows are on the page — never one
 * query per row.
 */
async function resolveReferenceLabels(rows: PaymentRow[]): Promise<Map<string, string>> {
  const planIds = [...new Set(rows.filter((r) => r.purpose === "subscription").map((r) => r.referenceId))];
  const programIds = [...new Set(rows.filter((r) => r.purpose === "program_purchase").map((r) => r.referenceId))];
  // PAY-01 (5 Sep 2026) — a booking Payment's referenceId is a
  // ProfessionalServiceOffering.id, not a Booking.id (see
  // schema.prisma's Payment.scheduledAt comment for why).
  const offeringIds = [...new Set(rows.filter((r) => r.purpose === "booking").map((r) => r.referenceId))];

  const [plans, programs, offerings] = await Promise.all([
    planIds.length > 0
      ? prisma.subscriptionPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    programIds.length > 0
      ? prisma.program.findMany({ where: { id: { in: programIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    offeringIds.length > 0
      ? prisma.professionalServiceOffering.findMany({ where: { id: { in: offeringIds } }, select: { id: true, label: true } })
      : Promise.resolve([]),
  ]);

  const labels = new Map<string, string>();
  for (const plan of plans as Array<{ id: string; name: string }>) labels.set(plan.id, plan.name);
  for (const program of programs as Array<{ id: string; name: string }>) labels.set(program.id, program.name);
  for (const offering of offerings as Array<{ id: string; label: string }>) labels.set(offering.id, offering.label);
  return labels;
}

function toListItem(p: PaymentRow, referenceLabel: string | null) {
  return {
    id: p.id,
    userId: p.user.id,
    userFullName: p.user.fullName,
    userEmail: p.user.email,
    purpose: p.purpose,
    referenceId: p.referenceId,
    // null only if the referenced Plan/Program row no longer exists
    // (never happens today — neither is deletable anywhere in this
    // console, see this file's top comment) — the frontend falls back to
    // the raw `referenceId` when this is null.
    referenceLabel,
    amountCents: p.amountCents,
    currency: p.currency,
    provider: p.provider,
    status: p.status,
    providerOrderId: p.providerOrderId,
    providerPaymentId: p.providerPaymentId,
    createdAt: p.createdAt,
  };
}

export async function listPayments(query: ListPaymentsQuery) {
  const where: Record<string, unknown> = {};
  if (query.startDate || query.endDate) {
    where.createdAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }
  if (query.search) {
    where.OR = [
      { providerOrderId: { contains: query.search, mode: "insensitive" } },
      { providerPaymentId: { contains: query.search, mode: "insensitive" } },
      { user: { fullName: { contains: query.search, mode: "insensitive" } } },
      { user: { email: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const payments = await prisma.payment.findMany({
    where,
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = payments as PaymentRow[];
  const referenceLabels = await resolveReferenceLabels(rows);

  // Summary reflects the search+date-range-scoped set, computed before the
  // Status/Purpose filters below narrow the table further — see this
  // file's top comment.
  const paidRows = rows.filter((r) => r.status === "paid");
  const summary = {
    totalCount: rows.length,
    capturedRevenueCents: paidRows.reduce((sum, r) => sum + r.amountCents, 0),
    failedCount: rows.filter((r) => r.status === "failed").length,
    successRate: rows.length > 0 ? paidRows.length / rows.length : null,
  };

  const filtered = rows.filter(
    (r) => (query.status ? r.status === query.status : true) && (query.purpose ? r.purpose === query.purpose : true),
  );

  return {
    payments: filtered.map((r) => toListItem(r, referenceLabels.get(r.referenceId) ?? null)),
    summary,
    // 06.03's spec'd gateway health indicator — see this file's top comment.
    notAvailable: ["gatewayHealth"],
  };
}

async function getPaymentOrThrow(id: string): Promise<PaymentRow> {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  if (!payment) {
    throw new ApiHttpError(404, "not_found", "Payment not found");
  }
  return payment as PaymentRow;
}

export async function getPaymentDetail(id: string) {
  const payment = await getPaymentOrThrow(id);
  const referenceLabels = await resolveReferenceLabels([payment]);
  const referenceLabel = referenceLabels.get(payment.referenceId) ?? null;

  // The thing actually purchased — a real object, not just the bare
  // label the list view uses, since 06.02's "related-entities card" is a
  // dedicated section. See this file's top comment for why this does NOT
  // also try to resolve the *resulting* Subscription/ProgramPurchase row:
  // neither has a direct foreign key back to the Payment that created it,
  // so any lookup would have to infer "the most recent Subscription for
  // this user+plan", which can silently point at the wrong row for a user
  // who subscribed to the same plan more than once. Showing the
  // unambiguous Plan/Program that was paid for is honest; guessing at the
  // downstream row is not.
  let reference: Record<string, unknown> | null = null;
  if (payment.purpose === "subscription") {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: payment.referenceId } });
    if (plan) {
      const p = plan as { id: string; tier: string; name: string; priceCents: number; billingCycle: string };
      reference = { type: "plan", id: p.id, name: p.name, tier: p.tier, priceCents: p.priceCents, billingCycle: p.billingCycle };
    }
  } else {
    const program = await prisma.program.findUnique({ where: { id: payment.referenceId } });
    if (program) {
      const p = program as { id: string; name: string; priceCents: number };
      reference = { type: "program", id: p.id, name: p.name, priceCents: p.priceCents };
    }
  }

  const auditRows = await prisma.auditLog.findMany({
    where: { entityType: "Payment", entityId: id },
    orderBy: { createdAt: "asc" },
  });

  return {
    payment: toListItem(payment, referenceLabel),
    reference,
    auditTrail: (
      auditRows as Array<{ id: string; action: string; actorId: string | null; metadata: unknown; createdAt: Date }>
    ).map((a) => ({
      id: a.id,
      action: a.action,
      actorId: a.actorId,
      metadata: (a.metadata as Record<string, unknown> | null) ?? null,
      createdAt: a.createdAt,
    })),
    // 06.02's "ledger flow card" line items beyond the one real gross
    // amount — see this file's top comment.
    notAvailable: ["ledgerLineItems"],
  };
}
