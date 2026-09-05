import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import {
  CreateExpenseInput,
  FinanceDateRangeQuery,
  ListExpensesQuery,
  ListInvoicesQuery,
  UpsertTaxConfigInput,
} from "./adminFinance.schema";

/**
 * **Update, 5 Sep 2026** — two things below are stale as of this pass and
 * left as-originally-written rather than rewritten in place (this repo's
 * own convention — see docs/mobile/07-open-questions-gaps.md's
 * append-don't-rewrite pattern): (1) Coach Settlements now IS modeled —
 * `adminSettlements.service.ts` shipped 31 Aug 2026 with a real
 * commission decision and, since PAY-01 (5 Sep 2026), real
 * coaching-payment data to settle against; only Influencer Payouts and
 * Bank/Payment Accounts remain genuinely unmodeled, for the reasons the
 * original bullet below still correctly gives for THOSE two. (2) The
 * revenue waterfall this comment calls "deferred whole" is built now —
 * see `getRevenueWaterfall()` further down, and its own doc comment for
 * why building it now (not earlier) is the right amount of honesty, not
 * a lowered bar.
 *
 * Module 10 — Finance (docs/admin/03-screen-inventory.md §10), added
 * 26 Aug 2026. Built directly from the architecture decision recorded in
 * reports/finance-architecture-plan.html — "one ledger": Finance reads
 * the same `Payment`/`Subscription` data Commerce (Module 06) already
 * owns, extended with three new entities (`Expense`, `Invoice`,
 * `TaxConfig`) that sit alongside `Payment` the same way `Escalation`
 * sits alongside `SupportTicket`. Not a parallel bookkeeping system —
 * see that doc's decision record for the full reasoning, and
 * docs/admin/07-open-questions-gaps.md gap §4 for the original question.
 *
 * **What's real (7 of 10 screens):**
 * - **10.01 Dashboard** — `getFinanceDashboard()`. KPI row (Revenue/
 *   Expenses/Net Profit MTD, AR, AP, Cash Balance) and a 6-month cash
 *   flow snapshot, all real aggregation over `Payment`/`Expense`. AR
 *   combines `past_due` Subscriptions (via their plan's `priceCents`)
 *   and `failed` Payments; AP is unpaid Expenses ONLY — coach/influencer
 *   payables aren't in it, see the module-level note below. Of the
 *   spec'd "Required Financial Actions" list, only "overdue" receivables
 *   are real (mapped from the same AR computation) — pending
 *   settlements, pending payouts, and pending refunds all stay
 *   `notAvailable`, same gaps as 06.01/06.04's waterfall and 09.04
 *   Business.
 * - **10.02 Revenue** — `listRevenue()`. Real revenue-by-purpose and
 *   revenue-by-plan breakdown, a monthly trend, and a real payment-status
 *   breakdown. The region slice of this screen is `notAvailable` — same
 *   `User.region` gap as 09.05 Geographic, not resolved by this pass.
 * - **10.03 Expenses & Payouts** — `listExpenses()`/`createExpense()`/
 *   `markExpensePaid()`. The Expenses half is real CRUD. The Payouts half
 *   (coach settlements, influencer payouts) is `notAvailable` — see the
 *   module-level note below for why those two entities aren't modeled at
 *   all yet, not just deferred as a screen.
 * - **10.04 Invoices** — `listInvoices()`/`getInvoiceDetail()`, plus
 *   `ensureInvoiceForPayment()`, called from `payments.service.ts`'s
 *   `activatePayment()` the moment a `Payment` flips to `paid`. No
 *   separate manual invoice-creation flow — every invoice traces back to
 *   exactly one real, gateway-verified Payment.
 * - **10.05 Receivables & Payables** — `listReceivablesPayables()`. Same
 *   AR computation as the Dashboard, with aging buckets; Payables is
 *   scoped to unpaid Expenses only, returned with an explicit
 *   `payablesScope: "expenses_only"` flag so the frontend can render an
 *   honest caveat rather than imply completeness.
 * - **10.08 Taxes & Compliance** — `upsertTaxConfig()`/`listTaxConfigs()`.
 *   Real CRUD over an admin-entered jurisdiction/rate — this build does
 *   not encode any actual tax law, and doesn't need to: the admin
 *   configures their own jurisdiction here. `isActive` defaults false so
 *   an unconfigured row renders as an honest "not configured" state.
 * - **10.10 Financial Reports** — `financialReports()`. Re-aggregates
 *   10.01/10.02/10.03's real data into P&L/Cash Flow/Revenue/Expense
 *   tabs — no new computation of its own.
 *
 * **What's NOT modeled at all (10.06 Coach Settlements, 10.07 Influencer
 * Payouts, 10.09 Bank/Payment Accounts)** — deliberately no service
 * functions or routes for these three, same "not even an empty shell"
 * precedent as 04.03/05.04/06.04 before they shipped:
 * - Coach Settlements / Influencer Payouts need a commission/take-rate
 *   decision this build has never made (Module 07's blocker, shared with
 *   09.04 Business Analytics), and even once decided there's no real
 *   coaching-payment data to settle against (`Relationship` carries no
 *   pricing — docs/coach/05-data-model.md §3). The spec's own
 *   "breakdown drawer showing settlement line items" implies a computed
 *   reconciliation, not a manually-typed number with nothing to
 *   reconcile against — a materially different bar than `Expense`
 *   above, which is a legitimate manual fact, not a reconciliation claim.
 * - Bank/Payment Accounts needs live bank connectivity (the spec's own
 *   "sync"/"refresh" language) — a vendor account to acquire, not a
 *   decision or a schema.
 * These three are not in `FINANCE_SUB_NAV` either — same "no dead links,
 * omit rather than stub" convention `SUPPORT_SUB_NAV` already set for
 * 08.03/08.04.
 *
 * **Currency:** every sum here adds `amountCents` directly with no FX
 * conversion, the same simplification `adminPayments.service.ts`'s
 * `capturedRevenueCents` already makes — this build's known USD/INR
 * pricing caveat (docs/mobile/07-open-questions-gaps.md) applies here
 * too, unchanged by this module.
 *
 * **No new permission key** — every route below gates behind the
 * existing `commerce` `AdminModule` scope, matching the `finance` role's
 * real, design-sourced scope (docs/admin/05-roles-permissions.md
 * explicitly collapses Finance into Commerce as one governance scope).
 *
 * Deliberately does NOT import `Payment`/`Subscription`/`Expense`/etc. as
 * Prisma model types — same reasoning as every other admin service file
 * this build (the un-generated `@prisma/client` stub has no real model
 * exports).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CASH_FLOW_MONTHS = 6;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function agingBucket(days: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

type PaymentRow = {
  id: string;
  userId: string;
  purpose: string;
  referenceId: string;
  amountCents: number;
  status: string;
  createdAt: Date;
};

type ExpenseRow = {
  id: string;
  category: string;
  description: string;
  amountCents: number;
  currency: string;
  status: string;
  incurredAt: Date;
  paidAt: Date | null;
  notes: string | null;
  recordedByAdminId: string;
  recordedByAdmin: { id: string; fullName: string };
  createdAt: Date;
  updatedAt: Date;
};

function toExpenseListItem(e: ExpenseRow) {
  return {
    id: e.id,
    category: e.category,
    description: e.description,
    amountCents: e.amountCents,
    currency: e.currency,
    status: e.status,
    incurredAt: e.incurredAt,
    paidAt: e.paidAt,
    notes: e.notes,
    recordedByAdminName: e.recordedByAdmin.fullName,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/**
 * Real Accounts Receivable: `past_due` Subscriptions (amount = their
 * plan's `priceCents`, one billing cycle owed) plus `failed` Payments
 * awaiting retry. Shared by the Dashboard's KPI row and 10.05's full
 * aging view — same "one real query, two presentations" shape as every
 * other module's stable-superset counts.
 */
async function getReceivables() {
  const [pastDueSubs, failedPayments] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: "past_due" },
      include: {
        plan: { select: { id: true, name: true, priceCents: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.payment.findMany({
      where: { status: "failed" },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const now = new Date();

  const fromSubscriptions = (
    pastDueSubs as Array<{
      id: string;
      renewsAt: Date | null;
      createdAt: Date;
      plan: { id: string; name: string; priceCents: number };
      user: { id: string; fullName: string; email: string };
    }>
  ).map((s) => {
    const referenceDate = s.renewsAt ?? s.createdAt;
    const days = daysBetween(referenceDate, now);
    return {
      id: s.id,
      source: "subscription_past_due" as const,
      userFullName: s.user.fullName,
      userEmail: s.user.email,
      description: `${s.plan.name} — past due`,
      amountCents: s.plan.priceCents,
      dueSince: referenceDate,
      daysOverdue: days,
      agingBucket: agingBucket(days),
    };
  });

  const fromFailedPayments = (
    failedPayments as Array<PaymentRow & { user: { id: string; fullName: string; email: string } }>
  ).map((p) => {
    const days = daysBetween(p.createdAt, now);
    return {
      id: p.id,
      source: "failed_payment" as const,
      userFullName: p.user.fullName,
      userEmail: p.user.email,
      description: "Failed payment awaiting retry",
      amountCents: p.amountCents,
      dueSince: p.createdAt,
      daysOverdue: days,
      agingBucket: agingBucket(days),
    };
  });

  const items = [...fromSubscriptions, ...fromFailedPayments];
  const totalCents = items.reduce((sum, i) => sum + i.amountCents, 0);

  return { items, totalCents, count: items.length };
}

/**
 * Real Accounts Payable, scoped to unpaid `Expense` rows only — coach/
 * influencer payables aren't in this because neither entity exists yet.
 * See this file's top comment.
 */
async function getPayables() {
  const unpaid = (await prisma.expense.findMany({
    where: { status: "pending" },
    include: { recordedByAdmin: { select: { id: true, fullName: true } } },
    orderBy: { incurredAt: "asc" },
  })) as ExpenseRow[];

  const now = new Date();
  const items = unpaid.map((e) => {
    const days = daysBetween(e.incurredAt, now);
    return {
      id: e.id,
      category: e.category,
      description: e.description,
      amountCents: e.amountCents,
      incurredAt: e.incurredAt,
      daysOutstanding: days,
      agingBucket: agingBucket(days),
    };
  });
  const totalCents = items.reduce((sum, i) => sum + i.amountCents, 0);

  return { items, totalCents, count: items.length, scope: "expenses_only" as const };
}

export async function getFinanceDashboard(query: FinanceDateRangeQuery) {
  const now = new Date();
  const mtdStart = query.startDate ?? startOfMonth(now);
  const mtdEnd = query.endDate ?? now;

  const [mtdPayments, mtdExpenses, allPaidPayments, allPaidExpenses, receivables, payables] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "paid", createdAt: { gte: mtdStart, lte: mtdEnd } },
    }) as Promise<PaymentRow[]>,
    prisma.expense.findMany({
      where: { incurredAt: { gte: mtdStart, lte: mtdEnd } },
    }) as Promise<ExpenseRow[]>,
    prisma.payment.findMany({ where: { status: "paid" }, select: { amountCents: true, createdAt: true } }) as Promise<
      Array<{ amountCents: number; createdAt: Date }>
    >,
    prisma.expense.findMany({
      where: { status: "paid" },
      select: { amountCents: true, paidAt: true, incurredAt: true },
    }) as Promise<Array<{ amountCents: number; paidAt: Date | null; incurredAt: Date }>>,
    getReceivables(),
    getPayables(),
  ]);

  const revenueMtdCents = mtdPayments.reduce((sum, p) => sum + p.amountCents, 0);
  const expensesMtdCents = mtdExpenses.reduce((sum, e) => sum + e.amountCents, 0);
  const netProfitMtdCents = revenueMtdCents - expensesMtdCents;

  const cashBalanceCents =
    allPaidPayments.reduce((sum, p) => sum + p.amountCents, 0) - allPaidExpenses.reduce((sum, e) => sum + e.amountCents, 0);

  // 6-month cash flow snapshot — a fixed trailing window, deliberately
  // decoupled from the MTD KPI range above, same "own fixed axis" choice
  // 09.01's Retention Cohort table already made for a similar reason.
  const monthBuckets: string[] = [];
  for (let i = CASH_FLOW_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets.push(monthKey(d));
  }
  const inflowByMonth = new Map<string, number>(monthBuckets.map((k) => [k, 0]));
  const outflowByMonth = new Map<string, number>(monthBuckets.map((k) => [k, 0]));
  for (const p of allPaidPayments) {
    const k = monthKey(p.createdAt);
    if (inflowByMonth.has(k)) inflowByMonth.set(k, (inflowByMonth.get(k) ?? 0) + p.amountCents);
  }
  for (const e of allPaidExpenses) {
    // Cash actually left on paidAt; a paid Expense with no paidAt
    // (shouldn't happen — markExpensePaid always sets it) falls back to
    // incurredAt rather than being silently dropped from the snapshot.
    const k = monthKey(e.paidAt ?? e.incurredAt);
    if (outflowByMonth.has(k)) outflowByMonth.set(k, (outflowByMonth.get(k) ?? 0) + e.amountCents);
  }
  const cashFlow = monthBuckets.map((k) => ({
    month: k,
    inflowCents: inflowByMonth.get(k) ?? 0,
    outflowCents: outflowByMonth.get(k) ?? 0,
    netCents: (inflowByMonth.get(k) ?? 0) - (outflowByMonth.get(k) ?? 0),
  }));

  // Burn rate — average monthly net cash flow across the snapshot window,
  // only when it's actually negative (a positive average isn't a "burn").
  // Runway — how many months the current cash balance covers at that
  // burn rate. Both null when there's nothing to divide by, never a
  // fabricated number — same "null over an invented 0%" discipline
  // 09.01's trend computation already uses.
  const avgNetCents = cashFlow.reduce((sum, m) => sum + m.netCents, 0) / cashFlow.length;
  const burnRateCents = avgNetCents < 0 ? Math.round(-avgNetCents) : null;
  const runwayMonths = burnRateCents && burnRateCents > 0 ? Math.round((cashBalanceCents / burnRateCents) * 10) / 10 : null;

  // Required Financial Actions — only the "overdue receivables" line has
  // real backing data; the other three spec'd items stay notAvailable.
  const requiredActions = {
    overdueReceivables: { count: receivables.count, amountCents: receivables.totalCents },
  };

  return {
    range: { startDate: mtdStart, endDate: mtdEnd },
    kpis: {
      revenueMtdCents,
      expensesMtdCents,
      netProfitMtdCents,
      accountsReceivableCents: receivables.totalCents,
      accountsPayableCents: payables.totalCents,
      cashBalanceCents,
    },
    cashFlow,
    burnRateCents,
    runwayMonths,
    requiredActions,
    // "pendingSettlements"/"pendingPayouts" — Coach Settlements/Influencer
    // Payouts aren't modeled (see this file's top comment).
    // "openRefundRequests" — same gap adminDashboard.service.ts already
    // names for 06.04 Refunds, reused here rather than a new key.
    notAvailable: ["pendingSettlements", "pendingPayouts", "openRefundRequests"],
  };
}

export async function listRevenue(query: FinanceDateRangeQuery) {
  const where: Record<string, unknown> = { status: "paid" };
  if (query.startDate || query.endDate) {
    where.createdAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }

  const payments = (await prisma.payment.findMany({ where, orderBy: { createdAt: "asc" } })) as PaymentRow[];

  const planIds = [...new Set(payments.filter((p) => p.purpose === "subscription").map((p) => p.referenceId))];
  const plans = planIds.length
    ? ((await prisma.subscriptionPlan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, name: true, tier: true },
      })) as Array<{ id: string; name: string; tier: string }>)
    : [];
  const planById = new Map(plans.map((p) => [p.id, p]));

  const totalCents = payments.reduce((sum, p) => sum + p.amountCents, 0);

  // Revenue-source donut — by purpose. bookingCents added 5 Sep 2026
  // (PAY-01) — before that, "subscription"/"program_purchase" were the
  // only two purposes that existed, so summing just those two equaled
  // totalCents; a booking payment would otherwise count in totalCents but
  // silently vanish from this breakdown, making the three slices not add
  // up to the whole.
  const byPurpose = {
    subscriptionCents: payments.filter((p) => p.purpose === "subscription").reduce((s, p) => s + p.amountCents, 0),
    programPurchaseCents: payments.filter((p) => p.purpose === "program_purchase").reduce((s, p) => s + p.amountCents, 0),
    bookingCents: payments.filter((p) => p.purpose === "booking").reduce((s, p) => s + p.amountCents, 0),
  };

  // Plan-performance table — subscription revenue grouped by plan.
  const byPlan = new Map<string, { planId: string; planName: string; tier: string; revenueCents: number; count: number }>();
  for (const p of payments) {
    if (p.purpose !== "subscription") continue;
    const plan = planById.get(p.referenceId);
    const key = p.referenceId;
    const existing = byPlan.get(key) ?? {
      planId: p.referenceId,
      planName: plan?.name ?? "(deleted plan)",
      tier: plan?.tier ?? "unknown",
      revenueCents: 0,
      count: 0,
    };
    existing.revenueCents += p.amountCents;
    existing.count += 1;
    byPlan.set(key, existing);
  }

  // Monthly trend, over whatever range was requested (defaults to
  // everything if no range given — same "no implicit window" convention
  // as adminPayments.service.ts's listPayments).
  const trendByMonth = new Map<string, number>();
  for (const p of payments) {
    const k = monthKey(p.createdAt);
    trendByMonth.set(k, (trendByMonth.get(k) ?? 0) + p.amountCents);
  }
  const trend = [...trendByMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, revenueCents]) => ({
    month,
    revenueCents,
  }));

  // Real transaction-status breakdown (all statuses, not just this
  // range's "paid" set) — the one honest slice of 10.02's spec'd
  // "region/transaction breakdown with status" this pass can build; the
  // region half is notAvailable (see below).
  const statusRows = (await prisma.payment.findMany({
    where:
      query.startDate || query.endDate
        ? { createdAt: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } }
        : {},
    select: { status: true },
  })) as Array<{ status: string }>;
  const statusBreakdown = {
    paid: statusRows.filter((r) => r.status === "paid").length,
    created: statusRows.filter((r) => r.status === "created").length,
    failed: statusRows.filter((r) => r.status === "failed").length,
  };

  return {
    range: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
    totalRevenueCents: totalCents,
    byPurpose,
    byPlan: [...byPlan.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    trend,
    statusBreakdown,
    // "regionalBreakdown" — no User.region field exists, same gap 09.05
    // Geographic is blocked on.
    notAvailable: ["regionalBreakdown"],
  };
}

/**
 * Revenue waterfall (PAY-06 / 06.01), added 5 Sep 2026 — deliberately
 * deferred whole when this file was first written (see this file's top
 * comment) because 3 of the 6 stages a waterfall implies (Discounts,
 * Refunds, Coach Settlements) didn't have real backing data yet, and
 * "rendering a waterfall with half its stages fabricated would
 * misrepresent real revenue" — building a partial chart wasn't the
 * honest failure mode there. All three now do: Coupons (31 Aug 2026),
 * Refunds (31 Aug 2026, real `razorpay.payments.refund()` call), and
 * Coach Settlements (31 Aug 2026 commission decision + PAY-01's 5 Sep
 * 2026 real coaching-payment data). This is that same six-stage waterfall,
 * built now that every stage is real:
 *
 *   Gross (list price before any discount)
 *     − Discounts (coupon redemptions actually applied to a captured payment)
 *   = Net of discounts (= the sum of `Payment.amountCents` for "paid" rows —
 *     already the post-discount charged amount, see schema.prisma's own
 *     comment on that field)
 *     − Refunds (processed Razorpay refunds)
 *     − Coach settlements (commission-net payouts actually paid to coaches)
 *   = Net revenue
 *
 * Gross is derived as `amountCents + (discountCents ?? 0)` per paid
 * Payment — reusing the exact number `resolveAmountCents()` in
 * payments.service.ts resolved at checkout time, not re-computed from a
 * plan/program/offering lookup (which could have since changed price).
 * Refunds and coach settlements are pulled from `Expense` (categories
 * "refund" and "coach_settlement") rather than the `Refund`/
 * `CoachSettlement` tables directly — this file's own "one ledger"
 * architecture already treats `Expense` as the canonical record the
 * moment either of those actions is taken (see `adminRefunds.service.ts`'s
 * and `adminSettlements.service.ts`'s own `ensureInvoiceForPayment`-style
 * write-through), so summing there is consistent with how 10.01/10.05
 * already compute Payables, not a second source of truth. This means
 * "Coach settlements" here is what's actually been PAID OUT in the range,
 * not gross booking value delivered-but-unsettled — an intentionally
 * conservative, honest number rather than an optimistic one.
 */
export async function getRevenueWaterfall(query: FinanceDateRangeQuery) {
  const paymentWhere: Record<string, unknown> = { status: "paid" };
  if (query.startDate || query.endDate) {
    paymentWhere.createdAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }

  const payments = (await prisma.payment.findMany({
    where: paymentWhere,
    select: { amountCents: true, discountCents: true },
  })) as Array<{ amountCents: number; discountCents: number | null }>;

  const netOfDiscountsCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const discountCents = payments.reduce((sum, p) => sum + (p.discountCents ?? 0), 0);
  const grossCents = netOfDiscountsCents + discountCents;

  const expenseWhere: Record<string, unknown> = { category: { in: ["refund", "coach_settlement"] } };
  if (query.startDate || query.endDate) {
    expenseWhere.incurredAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }
  const ledgerExpenses = (await prisma.expense.findMany({
    where: expenseWhere,
    select: { category: true, amountCents: true },
  })) as Array<{ category: string; amountCents: number }>;

  const refundCents = ledgerExpenses.filter((e) => e.category === "refund").reduce((s, e) => s + e.amountCents, 0);
  const coachSettlementCents = ledgerExpenses
    .filter((e) => e.category === "coach_settlement")
    .reduce((s, e) => s + e.amountCents, 0);

  const netRevenueCents = netOfDiscountsCents - refundCents - coachSettlementCents;

  return {
    range: { startDate: query.startDate ?? null, endDate: query.endDate ?? null },
    stages: {
      grossCents,
      discountCents,
      netOfDiscountsCents,
      refundCents,
      coachSettlementCents,
      netRevenueCents,
    },
    // "influencerPayoutCents" — deliberately not a seventh stage: unlike
    // coach settlements, InfluencerPayout amounts are admin-entered, not
    // computed from real attributed revenue (no campaign/attribution
    // pipeline exists — see that model's own schema.prisma comment), so
    // netting one against Gross here would imply a reconciliation this
    // build can't actually make.
    notAvailable: ["influencerPayoutCents"],
  };
}

export async function listExpenses(query: ListExpensesQuery) {
  const where: Record<string, unknown> = {};
  if (query.category) where.category = query.category;
  if (query.status) where.status = query.status;
  if (query.startDate || query.endDate) {
    where.incurredAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }

  const rows = (await prisma.expense.findMany({
    where,
    include: { recordedByAdmin: { select: { id: true, fullName: true } } },
    orderBy: { incurredAt: "desc" },
  })) as ExpenseRow[];

  const summary = {
    totalCount: rows.length,
    totalCents: rows.reduce((s, r) => s + r.amountCents, 0),
    pendingCents: rows.filter((r) => r.status === "pending").reduce((s, r) => s + r.amountCents, 0),
    paidCents: rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amountCents, 0),
    byCategory: Object.fromEntries(
      [...new Set(rows.map((r) => r.category))].map((cat) => [cat, rows.filter((r) => r.category === cat).reduce((s, r) => s + r.amountCents, 0)]),
    ),
  };

  return {
    expenses: rows.map(toExpenseListItem),
    summary,
    // Payouts half of 10.03 — see this file's top comment.
    notAvailable: ["coachSettlements", "influencerPayouts"],
  };
}

async function getExpenseOrThrow(id: string): Promise<ExpenseRow> {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { recordedByAdmin: { select: { id: true, fullName: true } } },
  });
  if (!expense) {
    throw new ApiHttpError(404, "not_found", "Expense not found");
  }
  return expense as ExpenseRow;
}

export async function createExpense(actorAdminId: string, input: CreateExpenseInput) {
  const expense = await prisma.expense.create({
    data: {
      category: input.category,
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency ?? "INR",
      incurredAt: input.incurredAt,
      notes: input.notes,
      recordedByAdminId: actorAdminId,
    },
  });
  await recordAudit({
    actorAdminId,
    action: "expense.create",
    entityType: "Expense",
    entityId: expense.id,
    metadata: { category: input.category, amountCents: input.amountCents },
  });
  return toExpenseListItem(await getExpenseOrThrow(expense.id));
}

export async function markExpensePaid(actorAdminId: string, id: string) {
  const expense = await getExpenseOrThrow(id);
  if (expense.status === "paid") {
    throw new ApiHttpError(409, "expense_already_paid", "This expense is already marked paid");
  }
  await prisma.expense.update({ where: { id }, data: { status: "paid", paidAt: new Date() } });
  await recordAudit({ actorAdminId, action: "expense.mark_paid", entityType: "Expense", entityId: id });
  return toExpenseListItem(await getExpenseOrThrow(id));
}

// ---- Invoices (10.04) ----------------------------------------------------

/**
 * Called from `payments.service.ts`'s `activatePayment()` the moment a
 * Payment's status flips to "paid" — the only place an Invoice is ever
 * created. Idempotent: `activatePayment()` itself already no-ops on an
 * already-paid Payment, but this checks independently too, so calling it
 * twice for the same Payment (defensive, not expected) never produces a
 * duplicate invoice or throws.
 */
export async function ensureInvoiceForPayment(paymentId: string): Promise<void> {
  const existing = await prisma.invoice.findUnique({ where: { paymentId } });
  if (existing) return;

  const year = new Date().getFullYear();
  const countThisYear = await prisma.invoice.count({
    where: { number: { startsWith: `INV-${year}-` } },
  });
  const number = `INV-${year}-${String(countThisYear + 1).padStart(3, "0")}`;

  await prisma.invoice.create({ data: { number, paymentId } });
}

export async function listInvoices(query: ListInvoicesQuery) {
  const where: Record<string, unknown> = {};
  if (query.startDate || query.endDate) {
    where.issuedAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }
  if (query.search) {
    where.OR = [
      { number: { contains: query.search, mode: "insensitive" } },
      { payment: { providerOrderId: { contains: query.search, mode: "insensitive" } } },
      { payment: { user: { fullName: { contains: query.search, mode: "insensitive" } } } },
      { payment: { user: { email: { contains: query.search, mode: "insensitive" } } } },
    ];
  }

  const rows = (await prisma.invoice.findMany({
    where,
    include: { payment: { include: { user: { select: { id: true, fullName: true, email: true } } } } },
    orderBy: { issuedAt: "desc" },
  })) as Array<{
    id: string;
    number: string;
    issuedAt: Date;
    payment: PaymentRow & { user: { id: string; fullName: string; email: string } };
  }>;

  return {
    invoices: rows.map((inv) => ({
      id: inv.id,
      number: inv.number,
      issuedAt: inv.issuedAt,
      amountCents: inv.payment.amountCents,
      userFullName: inv.payment.user.fullName,
      userEmail: inv.payment.user.email,
      paymentId: inv.payment.id,
    })),
    summary: { totalCount: rows.length, totalCents: rows.reduce((s, r) => s + r.payment.amountCents, 0) },
  };
}

// ---- Receivables & Payables (10.05) --------------------------------------

export async function listReceivablesPayables() {
  const [receivables, payables] = await Promise.all([getReceivables(), getPayables()]);
  return {
    receivables: receivables.items,
    receivablesTotalCents: receivables.totalCents,
    payables: payables.items,
    payablesTotalCents: payables.totalCents,
    // See this file's top comment — coach/influencer payables aren't in
    // `payables` above because neither entity exists yet.
    payablesScope: "expenses_only" as const,
    netPositionCents: receivables.totalCents - payables.totalCents,
  };
}

// ---- Taxes & Compliance (10.08) ------------------------------------------

type TaxConfigRow = {
  id: string;
  jurisdiction: string;
  ratePercent: string | number | null;
  isActive: boolean;
  updatedByAdminId: string;
  updatedByAdmin: { id: string; fullName: string };
  createdAt: Date;
  updatedAt: Date;
};

function toTaxConfigListItem(t: TaxConfigRow) {
  return {
    id: t.id,
    jurisdiction: t.jurisdiction,
    ratePercent: t.ratePercent === null ? null : Number(t.ratePercent),
    isActive: t.isActive,
    updatedByAdminName: t.updatedByAdmin.fullName,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function listTaxConfigs() {
  const rows = (await prisma.taxConfig.findMany({
    include: { updatedByAdmin: { select: { id: true, fullName: true } } },
    orderBy: { updatedAt: "desc" },
  })) as TaxConfigRow[];
  return { taxConfigs: rows.map(toTaxConfigListItem) };
}

export async function upsertTaxConfig(actorAdminId: string, input: UpsertTaxConfigInput) {
  const existing = (await prisma.taxConfig.findFirst({
    where: { jurisdiction: input.jurisdiction },
  })) as TaxConfigRow | null;

  const data = {
    jurisdiction: input.jurisdiction,
    ratePercent: input.ratePercent ?? null,
    isActive: input.isActive ?? false,
    updatedByAdminId: actorAdminId,
  };

  const saved = existing
    ? await prisma.taxConfig.update({ where: { id: existing.id }, data })
    : await prisma.taxConfig.create({ data });

  await recordAudit({
    actorAdminId,
    action: existing ? "tax_config.update" : "tax_config.create",
    entityType: "TaxConfig",
    entityId: saved.id,
    metadata: { jurisdiction: input.jurisdiction, ratePercent: input.ratePercent ?? null, isActive: data.isActive },
  });

  const full = (await prisma.taxConfig.findUnique({
    where: { id: saved.id },
    include: { updatedByAdmin: { select: { id: true, fullName: true } } },
  })) as TaxConfigRow;
  return toTaxConfigListItem(full);
}

// ---- Financial Reports (10.10) -------------------------------------------

/**
 * Re-aggregates 10.01/10.02/10.03's already-real data into the 4 tabs the
 * Figma spec's Financial Reports screen calls for — no new computation of
 * its own, same "packaging, not new data" shape 09.03 Fitness & Nutrition
 * was planned as a follow-up on 09.01's tabs.
 */
export async function financialReports(query: FinanceDateRangeQuery) {
  const [dashboard, revenue, expenses] = await Promise.all([
    getFinanceDashboard(query),
    listRevenue(query),
    listExpenses({ startDate: query.startDate, endDate: query.endDate }),
  ]);

  const revenueCents = dashboard.kpis.revenueMtdCents;
  const expensesCents = dashboard.kpis.expensesMtdCents;

  return {
    range: dashboard.range,
    profitAndLoss: {
      revenueCents,
      expensesByCategory: expenses.summary.byCategory,
      expensesCents,
      netProfitCents: dashboard.kpis.netProfitMtdCents,
    },
    cashFlow: dashboard.cashFlow,
    revenue: { byPurpose: revenue.byPurpose, byPlan: revenue.byPlan, trend: revenue.trend },
    expense: { byCategory: expenses.summary.byCategory, totalCents: expenses.summary.totalCents },
    ratios: {
      // Real, simple ratios only — anything needing a prior-period
      // baseline or an industry benchmark stays out rather than being
      // approximated as if it were precise.
      netMarginPct: revenueCents > 0 ? Math.round((dashboard.kpis.netProfitMtdCents / revenueCents) * 1000) / 10 : null,
      expenseToRevenuePct: revenueCents > 0 ? Math.round((expensesCents / revenueCents) * 1000) / 10 : null,
    },
    notAvailable: ["pendingSettlements", "pendingPayouts", "openRefundRequests", "regionalBreakdown"],
  };
}
