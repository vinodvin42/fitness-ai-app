import crypto from "node:crypto";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { ApiHttpError } from "../../middleware/errorHandler";
import { env } from "../../config/env";
import { getRazorpayClient, isRazorpayConfigured } from "../../lib/razorpayClient";
import { subscribe } from "../subscriptions/subscriptions.service";
import { purchaseProgram } from "../programPurchases/programPurchases.service";
import { claimRelationship, createBooking, hasBookingConflict } from "../coaching/coaching.service";
import { ensureInvoiceForPayment } from "../adminFinance/adminFinance.service";
import { validateCoupon, recordRedemptionForPayment } from "../coupons/coupons.service";
import { createActionItem } from "../../lib/adminActionQueue";
import { CreateOrderInput } from "./payments.schema";

/**
 * Razorpay integration (20 Aug 2026), closing gap §14's "no payment
 * gateway" note for real, for both Subscription & Payments (§M) and
 * Programs Commerce (§I) — both now route through this one order/verify
 * flow rather than duplicating payment logic per feature. **5 Sep 2026
 * (PAY-01):** Coach Booking (§E) joined as a third purpose, same flow,
 * same functions below — see resolveAmountCents()'s and activatePayment()'s
 * own "booking" branches, and coaching.service.ts's own doc comment for
 * why a booking specifically needs `Payment.scheduledAt` (the other two
 * purposes don't, since referenceId alone is enough to resolve everything
 * else about them):
 *
 *   1. Client calls POST /payments/razorpay/orders with what it wants to
 *      buy (a plan or a program) — createOrder() below resolves the real
 *      price server-side (never trusts a client-supplied amount), creates
 *      a Razorpay Order, and persists a Payment row with status "created".
 *   2. Client opens Razorpay's hosted Checkout (RazorpayCheckoutModal.tsx,
 *      a WebView — no native module linking needed) using the returned
 *      orderId/keyId.
 *   3. On success, the client calls POST /payments/razorpay/verify with
 *      Razorpay's signed response. verifyPayment() below recomputes the
 *      HMAC signature server-side and only THEN grants access — this is
 *      the actual security boundary; nothing before this point should be
 *      treated as "paid."
 *   4. Independently, Razorpay also calls POST /payments/razorpay/webhook
 *      (handleWebhook() below) — the async source of truth regardless of
 *      whether step 3 ever happens (e.g. the client crashes right after a
 *      successful charge but before it can report back). Both paths funnel
 *      through the same activatePayment() so a Payment can only ever be
 *      activated once.
 *
 * **15 Sep 2026 (R1 U6):** createOrder()'s booking branch also now claims
 * the real Relationship row(s) (schema.prisma's `RelationshipStatus`) into
 * `awaiting_payment` right after the Payment row above is created — see
 * that call site's own comment and coaching.service.ts's
 * claimRelationship() for the full requested/accepted/awaiting_payment/
 * activating/active lifecycle this feeds into.
 *
 * **16 Sep 2026 (gap §56):** that same claim now happens BEFORE the
 * Razorpay order is created, not after — and createOrder() refuses to
 * create the order at all (409 `relationship_pending_acceptance`) if the
 * claimed relationship is still `requested` (the coach hasn't accepted the
 * booking request yet). Money must never move, and a user must never even
 * see Razorpay's Checkout UI, for a relationship short of `accepted` — see
 * coaching.service.ts's acceptRelationship()/declineRelationship() for the
 * new real coach-side gate this enforces.
 *
 * RESOLVED 5 Sep 2026 (PAY-02) — every seeded priceCents value used to be
 * chosen and displayed as USD cents (`$14.99`) while Razorpay's native
 * currency is INR, which would have undercharged real money by roughly
 * 80x. Every seeded price is real INR paise now (see seedDatabase.ts and
 * seedContent/programs.ts) and every display site across all three
 * frontends shows ₹, not $ — see docs/mobile/07-open-questions-gaps.md
 * gap §14 for the full before/after. config/env.ts's PRICE_CURRENCY_CONFIRMED
 * guard stays in place regardless, as a general go-live confirmation
 * rather than a sign this specific bug is still open.
 */

// Go-live hardening (25 Aug 2026) — both signature checks below used to
// compare with plain `!==`, which short-circuits on the first differing
// byte. That makes the comparison's runtime leak how many leading bytes
// of a guess were correct — the textbook timing side-channel that
// `crypto.timingSafeEqual` exists to close, and exactly why Razorpay's
// own SDK ships a constant-time `validateWebhookSignature` helper rather
// than telling integrators to use `===`. Guard the length check first:
// `timingSafeEqual` throws on mismatched buffer lengths rather than
// returning false, and a length mismatch here isn't a real signature
// either way, so there's no timing information worth protecting by
// routing it through the constant-time path too.
function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

async function resolveAmountCents(
  input: CreateOrderInput,
): Promise<{
  amountCents: number;
  description: string;
  // U6 (15 Sep 2026) — only set for purpose "booking", so createOrder()
  // can claim the real Relationship row(s) into `awaiting_payment` right
  // after this resolves, without a second DB round trip to re-fetch the
  // offering it just validated.
  booking?: { professionalId: string; serviceType: "fitness" | "nutrition" | null };
}> {
  if (input.purpose === "subscription") {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.referenceId } });
    if (!plan) throw new ApiHttpError(404, "plan_not_found", "Subscription plan not found");
    if (plan.priceCents === 0) {
      throw new ApiHttpError(400, "plan_is_free", "This plan is free — subscribe directly, no payment needed");
    }
    return { amountCents: plan.priceCents, description: `${plan.name} subscription (${plan.billingCycle})` };
  }

  if (input.purpose === "booking") {
    // referenceId is the ProfessionalServiceOffering being booked, not a
    // pre-existing Booking — see Payment.scheduledAt's own schema comment
    // for why the specific slot has to travel alongside referenceId here
    // instead of being resolvable from it alone, the way plan/program are.
    const offering = await prisma.professionalServiceOffering.findUnique({ where: { id: input.referenceId } });
    if (!offering || !offering.isActive) {
      throw new ApiHttpError(404, "offering_not_found", "This coaching service could not be found");
    }
    if (offering.priceCents === 0) {
      throw new ApiHttpError(400, "offering_is_free", "This session is free — book directly, no payment needed");
    }
    const professional = await prisma.professional.findUnique({
      where: { id: offering.professionalId },
      select: { status: true, fullName: true },
    });
    if (!professional || professional.status !== "active") {
      throw new ApiHttpError(404, "professional_not_found", "Coach not found");
    }
    if (!input.scheduledAt) {
      throw new ApiHttpError(400, "scheduled_at_required", "scheduledAt is required to book a paid session");
    }
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw new ApiHttpError(400, "invalid_schedule_time", "scheduledAt must be a real, future date/time");
    }
    // Same conflict rule createBooking() itself re-checks at activation
    // time (see activatePayment's own comment on the narrow race that
    // check can't fully close) — catching an obviously-taken slot here
    // means the common case fails before Razorpay Checkout even opens,
    // rather than after a real charge.
    if (await hasBookingConflict(offering.professionalId, scheduledAt, offering.durationMinutes)) {
      throw new ApiHttpError(409, "slot_unavailable", "This time is no longer available — pick another slot");
    }
    return {
      amountCents: offering.priceCents,
      description: `${offering.label} with ${professional.fullName}`,
      booking: { professionalId: offering.professionalId, serviceType: offering.serviceType as "fitness" | "nutrition" | null },
    };
  }

  const program = await prisma.program.findUnique({ where: { id: input.referenceId } });
  if (!program) throw new ApiHttpError(404, "program_not_found", "Program not found");
  if (program.priceCents === 0) {
    throw new ApiHttpError(400, "program_is_free", "This program is free — no payment needed");
  }
  return { amountCents: program.priceCents, description: `${program.name} program purchase` };
}

export async function createOrder(userId: string, input: CreateOrderInput) {
  if (!isRazorpayConfigured()) {
    throw new ApiHttpError(
      503,
      "payment_gateway_not_configured",
      "Payments aren't configured on this server yet — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET",
    );
  }

  const { amountCents: listAmountCents, description, booking } = await resolveAmountCents(input);

  // 16 Sep 2026 (gap §56) — claim the real Relationship row(s) up front and
  // refuse to go any further if the coach hasn't accepted the request yet.
  // Deliberately BEFORE the razorpay.orders.create() call below (and before
  // the Payment row is even created) — a user must never be let into
  // Razorpay's hosted Checkout only to be refused after money would have
  // moved; that's the real BR-COM-011-adjacent honesty problem gap §56
  // exists to close, not just createBooking()'s own later, narrower guard.
  let bookingRelationshipIds: string[] = [];
  if (booking) {
    const serviceTypes: Array<"fitness" | "nutrition"> = booking.serviceType
      ? [booking.serviceType]
      : ["fitness", "nutrition"];
    const relationships = await Promise.all(
      serviceTypes.map((st) => claimRelationship(userId, booking.professionalId, st)),
    );
    if (relationships.some((r) => r.status === "requested")) {
      throw new ApiHttpError(
        409,
        "relationship_pending_acceptance",
        "This coach hasn't accepted your request yet — wait for them to accept before paying",
      );
    }
    bookingRelationshipIds = relationships.map((r) => r.id);
  }

  // Module 06.05 Coupons (31 Aug 2026) — apply an optional discount code
  // against the real list price. Validation is server-side; an invalid code
  // fails the order (422) rather than quietly charging full price. The
  // redemption is NOT recorded here — only once the payment is captured
  // (see activatePayment → recordRedemptionForPayment), so an abandoned
  // checkout never burns the user's one allowed redemption.
  let amountCents = listAmountCents;
  let couponCode: string | null = null;
  let discountCents: number | null = null;
  if (input.couponCode) {
    const result = await validateCoupon(userId, input.couponCode, listAmountCents);
    if (!result.valid) {
      throw new ApiHttpError(422, "coupon_invalid", result.reason);
    }
    amountCents = result.finalCents;
    couponCode = result.code;
    discountCents = result.discountCents;
  }

  const razorpay = getRazorpayClient();

  const order = await razorpay.orders.create({
    amount: amountCents,
    currency: env.RAZORPAY_CURRENCY,
    receipt: `${input.purpose}_${input.referenceId}_${Date.now()}`,
    notes: { userId, purpose: input.purpose, referenceId: input.referenceId },
  });

  const payment = await prisma.payment.create({
    data: {
      userId,
      purpose: input.purpose,
      referenceId: input.referenceId,
      amountCents,
      currency: env.RAZORPAY_CURRENCY,
      providerOrderId: order.id,
      status: "created",
      couponCode,
      discountCents,
      // PAY-01 — null for subscription/program_purchase, the specific slot
      // for booking (already validated in resolveAmountCents above).
      scheduledAt: input.purpose === "booking" ? new Date(input.scheduledAt!) : null,
    },
  });

  // U6 (15 Sep 2026) — advance the already-claimed, already-accepted
  // Relationship row(s) (claimed and checked above, before the Razorpay
  // order was even created) into `awaiting_payment` now that a real order/
  // Payment genuinely exists, so a status screen opened anytime between
  // now and Checkout completing (or being abandoned) shows an honest
  // "awaiting payment" state instead of nothing at all. Placed after the
  // Payment row above (not before) so a Razorpay/DB failure earlier in
  // this function never advances a relationship for an order that was
  // never actually created — same "only advance once genuinely committed"
  // discipline as coaching.service.ts's createBooking now uses for
  // activating/active. `status: { not: "active" }` guards a booking of a
  // second session with an already-active coach from ever being
  // downgraded back to awaiting_payment.
  if (bookingRelationshipIds.length > 0) {
    await prisma.relationship.updateMany({
      where: { id: { in: bookingRelationshipIds }, status: { not: "active" } },
      data: { status: "awaiting_payment" },
    });
  }

  await recordAudit({
    actorId: userId,
    action: "payment.order_created",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { purpose: input.purpose, referenceId: input.referenceId, amountCents, razorpayOrderId: order.id },
  });

  // §8 "premium.checkout_started" — the real moment Razorpay Checkout is
  // about to open client-side, for a subscription purchase specifically
  // (program_purchase/booking checkouts aren't "premium").
  if (input.purpose === "subscription") {
    await trackEvent(userId, "premium.checkout_started", { paymentId: payment.id, planId: input.referenceId }, { metadata: { amountCents } });
  }

  return {
    orderId: order.id,
    amountCents,
    currency: env.RAZORPAY_CURRENCY,
    keyId: env.RAZORPAY_KEY_ID,
    name: "23PrimeFit",
    description,
    couponCode,
    discountCents,
  };
}

interface PaymentRecord {
  id: string;
  userId: string;
  purpose: "subscription" | "program_purchase" | "booking";
  referenceId: string;
  status: "created" | "paid" | "failed";
  // PAY-01 — only set (and only read) when purpose is "booking". See its
  // own comment on the Payment model in schema.prisma.
  scheduledAt: Date | null;
  // U6 Premium entitlement — see the Payment model's own doc comment in
  // schema.prisma for the full "paid" vs. "actually activated" story.
  activationFailedAt: Date | null;
}

/**
 * Shared by both the client's /verify call and the webhook — whichever
 * reaches here first wins; the other is a no-op. Reuses the exact same
 * subscribe()/purchaseProgram()/createBooking() functions the old
 * direct-activate flow used, just now gated behind `verifiedPayment:
 * true`, which those functions require for any non-free plan/program/
 * offering (see their own doc comments). Returns the booking it created,
 * if any — verifyPayment() needs it to hand the client a real
 * BookingConfirmation without a second round trip; the webhook path
 * ignores this return value.
 *
 * The "whichever reaches here first wins" claim above only holds if the
 * paid-status transition itself is atomic. The webhook and a client's
 * /verify call each fetch their own `Payment` snapshot independently
 * (verifyPayment/handleWebhook above) and can genuinely race — Razorpay's
 * webhook commonly fires within milliseconds of the client's own checkout
 * callback. A plain `if (payment.status === "paid") return {}` guard reads
 * that stale, already-fetched snapshot, so both concurrent calls can pass
 * it and both proceed to call subscribe()/purchaseProgram()/createBooking()
 * for the same payment — subscribe() in particular has no uniqueness
 * guard, so this could create two simultaneously-"active" Subscription
 * rows for one user from a single payment. Using `updateMany` with a
 * `status: { not: "paid" }` filter makes the claim step itself atomic: only
 * the call whose update actually affects a row proceeds to activate.
 *
 * U6 Premium entitlement (15 Sep 2026, BR-COM-011 / Error & Recovery §9) —
 * the claim above only proves the MONEY is captured, not that the
 * entitlement itself was granted. If subscribe()/purchaseProgram() throws
 * AFTER the atomic claim (a DB hiccup, a dropped connection — nothing
 * exotic), the old code left the Payment stuck at `status: "paid"` forever
 * with no Subscription/ProgramPurchase ever created and no way back in:
 * the same `status: { not: "paid" }` claim filter that makes the race-safe
 * fast path safe also permanently refuses a retry, and the client's own
 * catch block sent the user to a flat "Payment Failed" screen — a lie,
 * since Razorpay really did charge them. This is exactly the recoverable-
 * state gap §9 names. Fixed the same "atomic claim, not read-then-write"
 * way as the race above, just keyed on `activationFailedAt` instead of
 * `status` for the retry case: activation failures for subscription/
 * program_purchase are now recorded distinctly (`activationFailedAt` +
 * `activationFailureReason`) and re-attempted via `retryActivation()`
 * below (`POST /payments/:id/retry-activation`), which never re-charges —
 * it only re-runs the DB-side grant. Booking is deliberately excluded:
 * its failure mode (a slot going unavailable in the capture window) is
 * often a *permanent* fact about the world, not a transient one, so it
 * keeps its own pre-existing "record it, don't auto-retry, needs a human"
 * path unchanged below.
 */
async function activatePayment(payment: PaymentRecord): Promise<{ booking?: Awaited<ReturnType<typeof createBooking>> }> {
  if (payment.status === "paid" && !payment.activationFailedAt) return {}; // fast path — already fully activated

  if (payment.status !== "paid") {
    const claimed = await prisma.payment.updateMany({
      where: { id: payment.id, status: { not: "paid" } },
      data: { status: "paid" },
    });
    if (claimed.count === 0) return {}; // a concurrent call (webhook vs. /verify) already claimed it — don't double-grant
  } else {
    // payment.status is already "paid" but activationFailedAt is set: this
    // is a genuine retry of a previously-failed activation attempt, not a
    // fresh one — money was captured earlier, the entitlement grant just
    // never finished. Same atomic-claim discipline as above, just keyed on
    // activationFailedAt so two concurrent retries (a user's manual Retry
    // tap racing a Razorpay webhook redelivery, which also funnels through
    // here) can't both re-run subscribe()/purchaseProgram().
    const claimedRetry = await prisma.payment.updateMany({
      where: { id: payment.id, activationFailedAt: { not: null } },
      data: { activationFailedAt: null, activationFailureReason: null },
    });
    if (claimedRetry.count === 0) return {}; // no longer in a failed state — another retry already owns it (or already finished)
  }

  let booking: Awaited<ReturnType<typeof createBooking>> | undefined;

  try {
    if (payment.purpose === "subscription") {
      await subscribe(payment.userId, { planId: payment.referenceId }, { verifiedPayment: true });
    } else if (payment.purpose === "booking") {
      const offering = await prisma.professionalServiceOffering.findUnique({ where: { id: payment.referenceId } });
      if (!offering) {
        // Should be unreachable — the offering existed at order-creation time
        // (resolveAmountCents checked it) and nothing in this build deletes a
        // ProfessionalServiceOffering (same "not deletable anywhere in this
        // console" note adminPayments.service.ts makes about Plans/Programs).
        // Treat it as a real failure rather than silently skipping, same as
        // that file's own precedent.
        throw new ApiHttpError(500, "offering_missing", "The coaching service for this payment no longer exists");
      }
      try {
        booking = await createBooking(
          payment.userId,
          { professionalId: offering.professionalId, offeringId: offering.id, scheduledAt: payment.scheduledAt!.toISOString() },
          { verifiedPayment: true },
        );
      } catch (err) {
        // Money has already been captured by Razorpay by this point (status
        // just flipped to "paid" above) — this only throws if the slot
        // became unavailable in the narrow window between order-creation
        // (which already checked it) and payment capture. No hold/lock
        // mechanism exists to fully close that race (the free-booking path
        // has the exact same unlocked check-then-create gap, just without a
        // real charge riding on it), so this is rare, not impossible. Rather
        // than let a paid-but-unfulfilled booking vanish silently, record it
        // distinctly for manual follow-up (refund or reschedule — no
        // automated refund flow exists yet, see gap doc's Refunds item) and
        // re-throw: the client needs to know the booking didn't happen even
        // though the charge did, not see a false success. Deliberately NOT
        // marked activationFailedAt/retryable (see this function's own top
        // comment) — a lost slot needs a human, not a blind re-run.
        await recordAudit({
          actorId: payment.userId,
          action: "booking.payment_captured_but_unfulfilled",
          entityType: "Payment",
          entityId: payment.id,
          metadata: { offeringId: offering.id, reason: err instanceof ApiHttpError ? err.code : "unknown_error" },
        });
        throw err;
      }
    } else {
      await purchaseProgram(payment.userId, payment.referenceId, { verifiedPayment: true });
    }

    await recordAudit({
      actorId: payment.userId,
      action: "payment.captured",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { purpose: payment.purpose, referenceId: payment.referenceId },
    });

    // Module 06.05 Coupons (31 Aug 2026) — record the coupon redemption now
    // that the payment is genuinely captured (idempotent, no-op if no coupon
    // was applied). See coupons.service.ts's recordRedemptionForPayment.
    await recordRedemptionForPayment(payment.id);

    // Module 10 Finance, added 26 Aug 2026 — the "one ledger" architecture
    // decision's real trigger point (reports/finance-architecture-plan.html):
    // every Payment that reaches "paid" gets exactly one Invoice, generated
    // here rather than through any separate manual flow. Idempotent on its
    // own, but this is the single choke point both the /verify call and the
    // webhook funnel through either way (this function's own guard above).
    await ensureInvoiceForPayment(payment.id);

    await prisma.payment.update({ where: { id: payment.id }, data: { activatedAt: new Date() } });

    // §8 "entitlement.activated" — the real BR-COM-011 boundary (see this
    // function's own top comment): money captured is not the same fact as
    // the entitlement actually granted, and this line is where the latter
    // becomes true.
    await trackEvent(payment.userId, "entitlement.activated", { paymentId: payment.id }, { metadata: { purpose: payment.purpose }, ruleId: "BR-COM-011" });

    return { booking };
  } catch (err) {
    if (payment.purpose === "booking") throw err; // booking's own catch above already recorded + rethrew this

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        activationFailedAt: new Date(),
        activationFailureReason: err instanceof ApiHttpError ? err.code : "unknown_error",
      },
    });
    await recordAudit({
      actorId: payment.userId,
      action: "payment.activation_failed",
      entityType: "Payment",
      entityId: payment.id,
      metadata: {
        purpose: payment.purpose,
        referenceId: payment.referenceId,
        reason: err instanceof ApiHttpError ? err.code : "unknown_error",
      },
    });

    // Admin Action Required queue (Wave 4, 20 Sep 2026) — the real, exact
    // condition the schema's own `entitlement_activation_failed` doc comment
    // names ("payment success + entitlement activation failure"): this
    // branch only runs for subscription/program_purchase (booking rethrows
    // above, before this point, and keeps its own separate
    // "booking.payment_captured_but_unfulfilled" audit-only signal — see
    // that catch's own comment on why it's deliberately not retryable/
    // queued the same way) and only once `payment.activationFailedAt` has
    // actually just been set on the row above. `severity: "high"` — money
    // was captured by Razorpay and the entitlement was not delivered, the
    // most urgent category this queue has.
    //
    // Dedup: unlike most other call sites of createActionItem (each fires
    // from a genuine one-time creation moment, per adminActionQueue.ts's own
    // top comment), THIS moment can genuinely recur for the same Payment —
    // retryActivation() clears activationFailedAt to retry, and can fail
    // again, re-entering this exact catch block for the same payment.id.
    // Same "check for an existing open item before creating" discipline as
    // professionalDashboard.service.ts's detectAndQueueStuckRelationships,
    // keyed on (type, entityType, entityId, status: "open") so a Payment
    // stuck in a repeated fail-retry-fail loop surfaces as one open admin
    // item, not a new row per attempt.
    const existingOpenItem = await prisma.adminActionItem.findFirst({
      where: {
        type: "entitlement_activation_failed",
        entityType: "Payment",
        entityId: payment.id,
        status: "open",
      },
      select: { id: true },
    });
    if (!existingOpenItem) {
      await createActionItem({
        type: "entitlement_activation_failed",
        entityType: "Payment",
        entityId: payment.id,
        severity: "high",
        metadata: {
          userId: payment.userId,
          purpose: payment.purpose,
          referenceId: payment.referenceId,
          reason: err instanceof ApiHttpError ? err.code : "unknown_error",
        },
      });
    }

    // §8 "entitlement.activation_failed" — the exact BR-COM-011 gap this
    // function's own top comment describes: money captured, entitlement
    // grant genuinely failed.
    await trackEvent(
      payment.userId,
      "entitlement.activation_failed",
      { paymentId: payment.id },
      { metadata: { purpose: payment.purpose, reason: err instanceof ApiHttpError ? err.code : "unknown_error" }, ruleId: "BR-COM-011" },
    );

    // A distinct, honest, detectable error — "paid" (Razorpay captured the
    // charge) is already true and stays true; only the entitlement grant
    // failed and is retryable with no further charge. The client keys off
    // this exact `code` to show a recoverable state instead of a flat
    // "Payment Failed" (§9) — see useRazorpayPurchase.ts / PaymentResultScreen.tsx.
    throw new ApiHttpError(
      502,
      "entitlement_activation_failed",
      "Your payment went through, but activating it failed. You haven't been charged again — tap Retry to finish, or contact support with your payment ID if this keeps happening.",
      { paymentId: payment.id },
    );
  }
}

export async function verifyPayment(
  userId: string,
  input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
) {
  if (!isRazorpayConfigured()) {
    throw new ApiHttpError(503, "payment_gateway_not_configured", "Payments aren't configured on this server yet");
  }

  const payment = await prisma.payment.findUnique({ where: { providerOrderId: input.razorpayOrderId } });
  if (!payment || payment.userId !== userId) {
    throw new ApiHttpError(404, "payment_not_found", "No matching payment order found for this user");
  }

  if (payment.status === "paid" && !payment.activationFailedAt) {
    // Idempotent retry of an already-verified, already-activated payment —
    // `booking` is omitted here even for a booking payment: activatePayment()'s
    // return value (the one place that shapes a real BookingConfirmation DTO)
    // only exists on the call that actually ran it, and this is deliberately
    // not re-derived from a raw Booking row (a different, thinner shape). A
    // client retrying an already-successful /verify call already navigated
    // on the first response; this is a safety-net path, not the common one.
    return { verified: true, purpose: payment.purpose, referenceId: payment.referenceId };
  }

  if (payment.status === "paid" && payment.activationFailedAt) {
    // U6 Premium entitlement — a prior activation attempt captured the
    // money but never finished granting the entitlement (see
    // activatePayment()'s own doc comment). The signature was already
    // verified once to get here; re-verifying it again would need the same
    // razorpayPaymentId/razorpaySignature this call was already given, so
    // just retry activation directly rather than re-deriving a decision
    // from the (already-consumed) signature check below.
    const { booking } = await activatePayment(payment);
    return { verified: true, purpose: payment.purpose, referenceId: payment.referenceId, booking };
  }

  // The actual security boundary — recompute the signature server-side
  // with the secret key, never trust that a client posting "success" means
  // it really was one.
  const expectedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");

  if (!timingSafeEqualHex(expectedSignature, input.razorpaySignature)) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
    throw new ApiHttpError(400, "invalid_signature", "Payment signature verification failed");
  }

  await prisma.payment.update({ where: { id: payment.id }, data: { providerPaymentId: input.razorpayPaymentId } });
  const { booking } = await activatePayment(payment);

  return { verified: true, purpose: payment.purpose, referenceId: payment.referenceId, booking };
}

/**
 * Razorpay webhook — the async source of truth independent of whether the
 * client's own /verify call ever completes. `rawBody` must be the exact
 * unparsed request body: Razorpay's webhook signature is computed over
 * raw bytes, not the reserialized JSON object express.json() would
 * produce — see payments.routes.ts for why this one route is mounted
 * with express.raw() instead of the app's usual express.json().
 */
export async function handleWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new ApiHttpError(503, "webhook_not_configured", "RAZORPAY_WEBHOOK_SECRET is not set");
  }
  if (!signatureHeader) {
    throw new ApiHttpError(400, "missing_signature", "Missing X-Razorpay-Signature header");
  }

  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  if (!timingSafeEqualHex(expected, signatureHeader)) {
    throw new ApiHttpError(400, "invalid_webhook_signature", "Webhook signature verification failed");
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  const orderId: string | undefined = event?.payload?.payment?.entity?.order_id;
  const paymentId: string | undefined = event?.payload?.payment?.entity?.id;

  if (!orderId) return; // an event type this app doesn't key off an order — nothing to do

  const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId } });
  if (!payment) return; // not an order from this app (or already cleaned up) — ignore, this is a webhook, not a client request

  if (event.event === "payment.captured") {
    if (paymentId && !payment.providerPaymentId) {
      await prisma.payment.update({ where: { id: payment.id }, data: { providerPaymentId: paymentId } });
    }
    await activatePayment(payment);
  } else if (event.event === "payment.failed" && payment.status === "created") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
  }
}

/**
 * U6 Premium entitlement — lets a client poll a specific Payment's real
 * state (GET /payments/:id) rather than guessing from a static "success"/
 * "failed" nav param. Scoped to the requesting user (404, not 403, for a
 * payment that exists but isn't theirs — same "don't confirm existence to
 * a non-owner" reasoning every other owned-resource lookup in this app
 * already follows). This is the read side of the recoverable state §9
 * requires: a screen can show "we're finishing activation" / "activation
 * needs a retry" / "you're all set" from real data instead of only the
 * one-shot result a /verify call returned at the moment it happened.
 */
export async function getPaymentForUser(userId: string, paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.userId !== userId) {
    throw new ApiHttpError(404, "payment_not_found", "Payment not found");
  }
  return {
    id: payment.id,
    purpose: payment.purpose,
    referenceId: payment.referenceId,
    status: payment.status,
    activatedAt: payment.activatedAt,
    activationFailedAt: payment.activationFailedAt,
    activationFailureReason: payment.activationFailureReason,
  };
}

/**
 * U6 Premium entitlement — the retry side of the recoverable state §9
 * requires (`POST /payments/:id/retry-activation`). Deliberately does NOT
 * take or re-check a Razorpay signature: the money was already captured
 * and verified by an earlier /verify call or webhook delivery (that's the
 * only way `status` can be "paid" at all), so this only re-runs the DB-side
 * entitlement grant — it can never cause a second charge. Refuses to run
 * for a payment that was never paid, or one with nothing to retry (already
 * active, or a booking — see activatePayment()'s own comment on why
 * booking is excluded from this retry path).
 *
 * **Fixed R2 Wave 7 (22 Sep 2026), found while building this wave's own
 * capstone integration test:** the `payment.purpose === "booking"` check
 * below used to sit AFTER the `!payment.activationFailedAt` check. Since
 * activatePayment()'s own booking branch deliberately NEVER sets
 * `activationFailedAt` (see that function's top comment and
 * schema.prisma's `Payment.activationFailedAt` doc comment — "Scoped to
 * subscription/program_purchase only"), a stuck booking payment's
 * `activationFailedAt` is always null, so the old ordering meant the
 * `!payment.activationFailedAt` guard fired FIRST for every single real
 * booking-purpose call — the dedicated `booking_retry_unsupported` branch
 * right below it, with its own specific "contact support with your
 * payment ID" message, could never actually run; it was real, reachable-
 * looking code that was in fact permanently dead. The user-visible bug:
 * tapping Retry on a stuck-but-genuinely-paid booking returned the
 * generic, misleading `activation_not_failed` ("This payment doesn't have
 * a failed activation to retry") — which reads as "everything's fine"
 * for a booking that very much did fail to activate — instead of the
 * honest, specific, already-written refusal this endpoint was clearly
 * built to give. Reordering the two checks (purpose gate before the
 * activationFailedAt gate) is the minimal fix: it makes the existing,
 * already-correct `booking_retry_unsupported` branch reachable for the
 * one real case it exists for, with no change to the
 * subscription/program_purchase behavior every other test in this suite
 * (paymentsActivationFailureRecovery.test.ts) already covers — those
 * still fail with `activation_not_failed` exactly as before whenever
 * `activationFailedAt` is null, since `purpose !== "booking"` for them.
 */
export async function retryActivation(userId: string, paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.userId !== userId) {
    throw new ApiHttpError(404, "payment_not_found", "Payment not found");
  }
  if (payment.status !== "paid") {
    throw new ApiHttpError(409, "payment_not_captured", "This payment was never captured — nothing to retry");
  }
  if (payment.purpose === "booking") {
    throw new ApiHttpError(
      409,
      "booking_retry_unsupported",
      "A captured booking payment can't be auto-retried — contact support with your payment ID",
    );
  }
  if (!payment.activationFailedAt) {
    throw new ApiHttpError(409, "activation_not_failed", "This payment doesn't have a failed activation to retry");
  }

  const { booking } = await activatePayment(payment);
  return { verified: true, purpose: payment.purpose, referenceId: payment.referenceId, booking };
}
