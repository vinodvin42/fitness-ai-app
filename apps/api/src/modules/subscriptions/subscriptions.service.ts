import { prisma } from "../../db/prisma";
import { assertHighImpactConfirmed } from "../../lib/highImpactAction";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { grantReferralRewardIfEligible } from "../referrals/referrals.service";
import { SubscribeInput } from "./subscriptions.schema";

/**
 * Subscription & Payments (docs/mobile/03-screen-inventory.md §M). Phase 3
 * scope: real Subscription Plans / Subscription Management / Purchase
 * History, backed by the SubscriptionPlan/Subscription models that have
 * existed since Phase 0. 20 Aug 2026: a real Razorpay integration
 * (`apps/api/src/modules/payments`) now backs Payment Checkout — `plan.
 * priceCents === 0` (Basic) still activates directly below with no
 * payment step, but any paid plan (Pro/Elite) now requires a verified
 * Razorpay payment first, see `subscribe()`'s `verifiedPayment` guard.
 * See docs/mobile/07-open-questions-gaps.md for the real currency-mismatch
 * caveat this integration did not silently paper over.
 *
 * 25 Aug 2026: `listPlans()` now filters to `isActive: true` — Module 06.05
 * (`apps/api/src/modules/adminPlans`) can archive a plan, and an archived
 * plan should stop being offered to new subscribers even though anyone
 * already on it keeps their existing `Subscription` row untouched.
 */

export function listPlans() {
  return prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } });
}

function renewalDateFor(billingCycle: "monthly" | "annual"): Date {
  const next = new Date();
  if (billingCycle === "annual") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

/**
 * U6 Premium entitlement (15 Sep 2026) — previously filtered to
 * `["active", "trialing"]` only, so a `past_due` Subscription (the one
 * other non-terminal status this model already declares — see
 * adminFinance.service.ts's real Accounts Receivable report, which already
 * reads `past_due` rows) silently vanished from this endpoint: the mobile
 * client would show "Unlock your full potential" as if the user had never
 * subscribed at all, even though a real, billing-troubled Subscription row
 * existed for them. `past_due` now included.
 *
 * This is the ACTIONABLE current subscription — used by `subscribe()` (to
 * decide whether there's a live plan to replace) and `cancelSubscription()`
 * (to decide whether there's anything to cancel). `canceled`/`expired`/
 * `revoked` are all correctly excluded here: none of them is a plan a user
 * can still act on. For DISPLAY purposes (SubscriptionScreen.tsx needing
 * to render an honest `expired`/`revoked` state rather than silently
 * falling back to "no subscription"), use `getSubscriptionForDisplay`
 * below instead — see gap §57.
 */
export async function getCurrentSubscription(userId: string) {
  const current = await prisma.subscription.findFirst({
    where: { userId, status: { in: ["active", "trialing", "past_due"] } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (!current) return null;
  return maybeExpireLapsed(current as SubscriptionWithPlan);
}

/**
 * Gap §57 (18 Sep 2026) — the read `GET /subscriptions/me` actually uses.
 * Unlike `getCurrentSubscription` above (deliberately scoped to
 * "actionable" statuses only), this returns the user's single most recent
 * Subscription row regardless of status, EXCEPT `canceled` — `subscribe()`
 * still sets an old row to `canceled` when a user switches plans (that's
 * unchanged by this pass), but it always does so in the same beat as
 * creating a newer `active` row, so a real user-facing "most recent
 * subscription is canceled" case doesn't arise from that path; the guard
 * here just preserves this endpoint's original "no current subscription"
 * read for that status, unchanged from before this pass. `expired` and
 * `revoked`, by contrast, are real terminal states this screen must be
 * able to show distinctly (BR-COM-011 / Error & Recovery §9's honesty
 * requirement, the same discipline gap §48 already applied here) — hiding
 * them behind a blank "Unlock your full potential" would be exactly the
 * "silently vanished" bug this file's own history (see the doc comment
 * above) has already been fixed for once, for `past_due`.
 */
export async function getSubscriptionForDisplay(userId: string) {
  const latest = await prisma.subscription.findFirst({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (!latest || latest.status === "canceled") return null;
  const settled = await maybeExpireLapsed(latest as SubscriptionWithPlan);
  return { ...settled, displayState: deriveDisplayState(settled) };
}

/**
 * U-M4 — "Subscription states: pending, suspended, expiring, expired,
 * revoked; cancel and reactivate".
 *
 * `pending`, `suspended`, `expired` and `revoked` are real stored
 * statuses. `expiring` is derived here instead, because it is a
 * time-window state ("7 days before end", spec §10) and this codebase
 * has no scheduled worker to flip it on the day — see
 * `maybeExpireLapsed`'s own comment for why that constraint is real.
 * Storing it would leave it wrong for every subscription nobody happened
 * to read during the window; deriving it is correct for every read.
 *
 * Returned as a separate `displayState` rather than overwriting
 * `status`, so a client can still see the stored truth and nothing
 * downstream mistakes a derived label for a persisted transition.
 */
export const EXPIRING_WINDOW_DAYS = 7;

export type SubscriptionDisplayState =
  | "pending"
  | "active"
  | "expiring"
  | "expired"
  | "suspended"
  | "revoked"
  | "canceled"
  | "past_due";

function deriveDisplayState(s: { status: string; renewsAt: Date | null; cancelAtPeriodEnd: boolean }): SubscriptionDisplayState {
  if (s.status === "pending") return "pending";
  if (s.status === "suspended") return "suspended";
  if (s.status === "revoked") return "revoked";
  if (s.status === "expired") return "expired";
  if (s.status === "canceled") return "canceled";
  if (s.status === "past_due") return "past_due";

  // active or trialing from here.
  if (s.renewsAt) {
    const daysLeft = (s.renewsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    // Only an ending subscription is "expiring". One that renews is
    // simply active, and telling a paying user their access is about to
    // end when it is about to renew is the kind of wrong that generates
    // a cancellation.
    if (s.cancelAtPeriodEnd && daysLeft >= 0 && daysLeft <= EXPIRING_WINDOW_DAYS) return "expiring";
  }
  return "active";
}

/**
 * Gap §57 (18 Sep 2026) — the real lazy-expiry mechanism backing the
 * cancel-at-period-end policy `cancelSubscription()` now implements.
 *
 * This codebase has no persistent worker process and no scheduled-job
 * infrastructure that could reach it — the only real "server" this API
 * runs as is a request-driven Express process (`npm run dev`/deployed App
 * Service), and the one real CI/CD workflow that exists
 * (`.github/workflows/deploy-azure-api.yml`) is `workflow_dispatch` only,
 * explicitly NOT on a schedule, with no live Azure endpoint this pass is
 * permitted to touch or verify against anyway (worktree constraints: no
 * `gh workflow run`, no Azure). A scheduled GitHub Actions workflow calling
 * an internal admin endpoint was considered and rejected for exactly that
 * reason: it would be unverifiable fabricated infrastructure in this
 * environment, not a real, exercised mechanism — the same "don't build
 * what you can't honestly verify" discipline gap §48 already applied to
 * `expiring`/`revoked` before this pass existed to answer it for real.
 *
 * Instead, this is a real, honest, in-request lazy-expiry check: every
 * time a `cancelAtPeriodEnd` Subscription is actually read past its
 * `renewsAt`, this flips it to a real, DB-persisted `expired` status right
 * then, before returning. This is a genuine, verifiable mechanism (proven
 * by this pass's own tests and local HTTP run — flip `renewsAt` into the
 * past, read the row, see `expired` land in Postgres), not merely a
 * client-side display trick the way gap §48's original `entitlementDisplay`
 * lapsed-read was. The one honest limitation: a subscription that lapses
 * and is never read again stays `active` in the DB until it next is read
 * — acceptable because every real path that matters (the user's own
 * `GET /subscriptions/me`, this function itself, called from `subscribe()`
 * before replacing an existing plan) reads through here.
 */
type SubscriptionWithPlan = {
  id: string;
  userId: string;
  planId: string;
  status: string;
  renewsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  revokedAt: Date | null;
  revokedReason: string | null;
  createdAt: Date;
  plan: { id: string; tier: string; name: string; priceCents: number; billingCycle: string };
};

async function maybeExpireLapsed(subscription: SubscriptionWithPlan): Promise<SubscriptionWithPlan> {
  const lapsed =
    subscription.cancelAtPeriodEnd &&
    subscription.renewsAt != null &&
    subscription.renewsAt.getTime() < Date.now() &&
    (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due");
  if (!lapsed) return subscription;

  const expired = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "expired" },
    include: { plan: true },
  });

  await recordAudit({
    actorId: subscription.userId,
    action: "subscription.expired",
    entityType: "Subscription",
    entityId: subscription.id,
    metadata: { reason: "cancel_at_period_end_lapsed" },
  });

  return expired as SubscriptionWithPlan;
}

/**
 * Subscribing while another plan is active/trialing replaces it — no
 * proration, no partial-period credit. That's a real simplification (a
 * production billing system would prorate or queue the change for the
 * next cycle) but an honest one: nothing here claims to charge money.
 *
 * 20 Aug 2026: paid plans (priceCents > 0) now require `verifiedPayment:
 * true` — set only by payments.service.ts's activatePayment(), after a
 * Razorpay signature has actually been verified (or the webhook confirms
 * it). This is the one place that gate is enforced, so calling this
 * function directly with a paid plan and no verified payment always fails
 * closed, whether the caller is a route handler or another service.
 */
export async function subscribe(
  userId: string,
  input: SubscribeInput,
  opts: { verifiedPayment?: boolean } = {},
) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
  if (!plan) {
    throw new ApiHttpError(404, "plan_not_found", "Subscription plan not found");
  }
  if (plan.priceCents > 0 && !opts.verifiedPayment) {
    throw new ApiHttpError(
      402,
      "payment_required",
      "This plan requires payment — create a Razorpay order via POST /payments/razorpay/orders first",
    );
  }

  const existing = await getCurrentSubscription(userId);
  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data: { status: "canceled" } });
  }

  const subscription = await prisma.subscription.create({
    data: {
      userId,
      planId: plan.id,
      status: "active",
      renewsAt: renewalDateFor(plan.billingCycle),
    },
    include: { plan: true },
  });

  await recordAudit({
    actorId: userId,
    action: existing ? "subscription.changed" : "subscription.started",
    entityType: "Subscription",
    entityId: subscription.id,
    metadata: { planId: plan.id, tier: plan.tier, previousSubscriptionId: existing?.id ?? null },
  });

  // §O Referral rewards (31 Aug 2026) — a paid subscription is the "referee
  // converted" event that grants the referrer one month of credit. Only
  // paid plans count (a free Basic plan isn't a conversion); idempotent per
  // referral (see grantReferralRewardIfEligible). Guarded so a referral
  // reward failure can never break the subscription that already succeeded.
  if (plan.priceCents > 0) {
    try {
      await grantReferralRewardIfEligible(userId);
    } catch {
      // Non-fatal — the subscription stands; the reward can be reconciled later.
    }
  }

  return subscription;
}

/**
 * Cancel-at-period-end (gap §57, 18 Sep 2026) — the real, decided
 * cancellation policy, replacing the old immediate-`canceled` flip. This
 * is the standard, near-universal SaaS convention: a user who cancels
 * keeps access through the period they already paid for (`renewsAt`), and
 * only lapses to a real terminal `expired` status once that date passes
 * (see `maybeExpireLapsed` above for the honest lazy-expiry mechanism that
 * performs that flip — no billing/renewal cron exists in this build to do
 * it on a schedule). `status` is deliberately left untouched here — the
 * user's access is genuinely unchanged the moment they cancel, which is
 * exactly what `cancelAtPeriodEnd: true` on an otherwise-still-`active`
 * row is meant to communicate to any reader (this endpoint's own response,
 * `entitlementDisplay()` in SubscriptionScreen.tsx, a future admin view).
 *
 * Idempotent: canceling an already-cancelAtPeriodEnd subscription 409s
 * rather than silently no-op'ing, so a client can't mistake a repeat tap
 * for a fresh confirmation of a policy it already agreed to.
 */
export async function cancelSubscription(userId: string) {
  const existing = await getCurrentSubscription(userId);
  if (!existing) {
    throw new ApiHttpError(404, "no_active_subscription", "No active subscription to cancel");
  }
  if (existing.cancelAtPeriodEnd) {
    throw new ApiHttpError(
      409,
      "already_canceling",
      "This subscription is already set to cancel at the end of its billing period",
    );
  }

  const updated = await prisma.subscription.update({
    where: { id: existing.id },
    data: { cancelAtPeriodEnd: true },
    include: { plan: true },
  });

  await recordAudit({
    actorId: userId,
    action: "subscription.cancel_at_period_end",
    entityType: "Subscription",
    entityId: updated.id,
    metadata: { planId: updated.planId, renewsAt: updated.renewsAt },
  });

  return updated;
}

export function listSubscriptionHistory(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Real admin force-revoke (gap §57, 18 Sep 2026) — the genuinely distinct,
 * admin-initiated terminal state `revoked`, for a fraud/chargeback/ToS
 * case. Route-gated on `commerce: approve` (see adminSubscriptions.routes.ts
 * — the strongest commerce-module action, matching the fact that this is
 * an irreversible, money-adjacent action, not an ordinary edit). Unlike
 * `cancelSubscription`, this always takes effect immediately: revocation
 * is a "this access was wrongly granted / must stop now" action, not a
 * user's own end-of-period request, so there's no honest reason to delay
 * it to `renewsAt`.
 *
 * `reason` is required (validated by the route's Zod schema) and is
 * persisted on the row itself (`revokedReason`) as well as echoed into the
 * `recordAudit` entry — this is exactly the kind of action that trail
 * exists for.
 */
export async function revokeSubscription(actorAdminId: string, subscriptionId: string, reason: string) {
  const existing = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!existing) {
    throw new ApiHttpError(404, "not_found", "Subscription not found");
  }
  if (existing.status === "revoked") {
    throw new ApiHttpError(409, "already_revoked", "This subscription has already been revoked");
  }
  if (existing.status === "expired" || existing.status === "canceled") {
    throw new ApiHttpError(
      409,
      "subscription_already_terminal",
      `This subscription is already ${existing.status} — nothing to revoke`,
    );
  }

  const revoked = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: "revoked", revokedAt: new Date(), revokedReason: reason },
    include: { plan: true },
  });

  await recordAudit({
    actorAdminId,
    action: "subscription.revoked",
    entityType: "Subscription",
    entityId: revoked.id,
    metadata: { userId: revoked.userId, planId: revoked.planId, reason },
  });

  return revoked;
}

/**
 * Real admin un-revoke (gap §57 follow-up, 22 Sep 2026) — reverses a
 * mistaken or since-resolved `revoked` force-revoke (dispute overturned,
 * fraud finding reversed, or the original revoke was a genuine admin
 * error). Same `commerce: approve` gate as `revokeSubscription` itself
 * (see adminSubscriptions.routes.ts) and the same BR-ADM-005
 * reason-required discipline (`unrevokeSubscriptionSchema`, 10-char
 * minimum, mirrors `revokeSubscriptionSchema`).
 *
 * The one real decision this needed: what status to land on. NOT an
 * unconditional flip back to `active` — the row has no memory of what its
 * status was the instant before it was revoked, and time has passed since
 * (the entitlement period this subscription actually paid for may have
 * already run out while it sat revoked). The honest answer is to compute,
 * for real, what this subscription's status would naturally be right now
 * had it never been revoked at all — exactly the same question
 * `maybeExpireLapsed` above already answers for the lazy-expiry path, just
 * evaluated once here instead of on every read:
 *   - `renewsAt` unset, or still in the future → the paid-for period
 *     hasn't lapsed → restore to `active`.
 *   - `renewsAt` in the past → the period is over and nothing renewed it
 *     while this row was revoked → land in `expired`, not `active`, since
 *     handing back an already-lapsed entitlement would be dishonest.
 * `cancelAtPeriodEnd` is left exactly as it was — un-revoking doesn't
 * change whether the user had asked to cancel; if it was already true and
 * the period is still current, the row correctly comes back as an
 * `active` subscription still scheduled to lapse at `renewsAt`, and the
 * normal `maybeExpireLapsed` mechanism picks it up from there same as any
 * other cancel-at-period-end row.
 *
 * Atomic claim-once transition, same discipline as every other one-time
 * state transition in this codebase (see markPayoutPaid in
 * adminInfluencers.service.ts for the exact template this mirrors):
 * `updateMany` with a `status: "revoked"` filter makes the claim itself
 * atomic, so two concurrent un-revoke calls on the same row can't both
 * succeed — only the one whose `updateMany` actually affects a row goes
 * on to report success; the other 409s.
 */
export async function unrevokeSubscription(actorAdminId: string, subscriptionId: string, reason: string) {
  const existing = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!existing) {
    throw new ApiHttpError(404, "not_found", "Subscription not found");
  }
  if (existing.status !== "revoked") {
    throw new ApiHttpError(
      409,
      "not_revoked",
      "This subscription isn't currently revoked — nothing to un-revoke",
    );
  }

  const restoredStatus = existing.renewsAt != null && existing.renewsAt.getTime() < Date.now() ? "expired" : "active";

  const claimed = await prisma.subscription.updateMany({
    where: { id: subscriptionId, status: "revoked" },
    data: { status: restoredStatus, revokedAt: null, revokedReason: null },
  });
  if (claimed.count === 0) {
    // A concurrent call already un-revoked (or re-revoked) it between our read above and now.
    throw new ApiHttpError(409, "not_revoked", "This subscription isn't currently revoked — nothing to un-revoke");
  }

  const restored = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { plan: true },
  });

  await recordAudit({
    actorAdminId,
    action: "subscription.unrevoked",
    entityType: "Subscription",
    entityId: restored.id,
    metadata: { userId: restored.userId, planId: restored.planId, reason, restoredStatus },
  });

  return restored;
}


/**
 * U-M4's suspend — a chargeback or an admin hold. Reversible, unlike
 * `revoke`, and kept as a separate action for exactly that reason: an
 * admin reaching for "stop this access now, pending investigation"
 * should not have to use the irreversible one and hope.
 *
 * High-impact under BR-ADM-005: it removes paid-for access.
 */
export async function suspendSubscription(
  actorAdminId: string,
  subscriptionId: string,
  input: { reason?: string | null; confirmation?: string | null },
) {
  const reason = assertHighImpactConfirmed(input);

  const existing = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!existing) throw new ApiHttpError(404, "subscription_not_found", "Subscription not found");
  if (existing.status !== "active" && existing.status !== "trialing" && existing.status !== "past_due") {
    throw new ApiHttpError(409, "not_suspendable", `A ${existing.status} subscription cannot be suspended`);
  }

  // Conditional updateMany, not a bare update — the same claim-once
  // discipline every other status flip in this file uses, so two
  // concurrent suspends cannot both "win".
  const claimed = await prisma.subscription.updateMany({
    where: { id: subscriptionId, status: existing.status },
    data: { status: "suspended" },
  });
  if (claimed.count === 0) {
    throw new ApiHttpError(409, "already_changed", "This subscription changed while you were acting on it");
  }

  await recordAudit({
    actorAdminId,
    action: "subscription.suspended",
    entityType: "Subscription",
    entityId: subscriptionId,
    ruleId: "BR-COM-011",
    stateBefore: { status: existing.status },
    stateAfter: { status: "suspended" },
    metadata: { reason },
  });

  return prisma.subscription.findUnique({ where: { id: subscriptionId }, include: { plan: true } });
}

/** The reverse — §10's SUSPENDED -> ACTIVE on "resolved". */
export async function reactivateSubscription(
  actorAdminId: string,
  subscriptionId: string,
  input: { reason?: string | null; confirmation?: string | null },
) {
  const reason = assertHighImpactConfirmed(input);

  const existing = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!existing) throw new ApiHttpError(404, "subscription_not_found", "Subscription not found");
  if (existing.status !== "suspended") {
    throw new ApiHttpError(409, "not_suspended", "Only a suspended subscription can be reactivated");
  }

  // An expired term must not come back as active just because the hold
  // was lifted — restore to what is actually true now.
  const lapsed = existing.renewsAt != null && existing.renewsAt.getTime() < Date.now();
  const restored = lapsed ? "expired" : "active";

  const claimed = await prisma.subscription.updateMany({
    where: { id: subscriptionId, status: "suspended" },
    data: { status: restored },
  });
  if (claimed.count === 0) {
    throw new ApiHttpError(409, "already_changed", "This subscription changed while you were acting on it");
  }

  await recordAudit({
    actorAdminId,
    action: "subscription.reactivated",
    entityType: "Subscription",
    entityId: subscriptionId,
    ruleId: "BR-COM-011",
    stateBefore: { status: "suspended" },
    stateAfter: { status: restored },
    metadata: { reason, restoredStatus: restored },
  });

  return prisma.subscription.findUnique({ where: { id: subscriptionId }, include: { plan: true } });
}
