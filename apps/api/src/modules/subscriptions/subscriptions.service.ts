import { prisma } from "../../db/prisma";
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

export function getCurrentSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: { in: ["active", "trialing"] } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
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

export async function cancelSubscription(userId: string) {
  const existing = await getCurrentSubscription(userId);
  if (!existing) {
    throw new ApiHttpError(404, "no_active_subscription", "No active subscription to cancel");
  }

  const canceled = await prisma.subscription.update({
    where: { id: existing.id },
    data: { status: "canceled" },
    include: { plan: true },
  });

  await recordAudit({
    actorId: userId,
    action: "subscription.canceled",
    entityType: "Subscription",
    entityId: canceled.id,
    metadata: { planId: canceled.planId },
  });

  return canceled;
}

export function listSubscriptionHistory(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
}
