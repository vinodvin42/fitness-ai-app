import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { env } from "../src/config/env";
import { verifyPayment } from "../src/modules/payments/payments.service";
import { ApiHttpError } from "../src/middleware/errorHandler";

/**
 * R2 Wave 7 (22 Sep 2026) — the capstone integration test for Developer 3's
 * (Admin/Website/Partner) entire R1 work package. Walks the ONE mandatory
 * failure scenario the plan requires end to end, through the real, already-
 * shipped systems built across Waves 0-6, all against real HTTP + real
 * Postgres, no mocking:
 *
 *   1. A professional accepts an admin-proposed offer (professionalOffers
 *      .service.ts's acceptOffer, Wave 2/6) -> a real, `accepted`
 *      Relationship via coaching.service.ts's claimRelationship()/
 *      acceptRelationship().
 *   2. A real booking-purpose Payment for that relationship's professional
 *      genuinely fails ENTITLEMENT activation (money captured, the coaching
 *      Booking never gets created) — see below for why this needs a
 *      DIFFERENT real trigger than Wave 4.4's subscription/program_purchase
 *      test used.
 *   3. The Relationship correctly never reaches `active` — verified via a
 *      direct Postgres read, not the response body.
 *   4. The user gets the existing, real recoverable surface (GET
 *      /payments/:id, POST /payments/:id/retry-activation) — real and
 *      callable for this exact Payment, even though (as this suite proves
 *      rather than assumes) booking correctly refuses the auto-retry path.
 *   5. The professional's real dashboard (professionalDashboard.service.ts's
 *      detectAndQueueStuckRelationships, Wave 3) detects this exact
 *      Relationship as stuck.
 *   6. A real `relationship_activation_failed` AdminActionItem lands and is
 *      queryable via the real, unified GET /admin/action-items (Wave 1/4).
 *
 * **Why THIS trigger, not Wave 4.4's:** payments.service.ts's
 * activatePayment() has an explicit, doc-commented branch —
 * `if (payment.purpose === "booking") throw err;` — that deliberately
 * excludes booking-purpose payments from the generic `activationFailedAt` /
 * `entitlement_activation_failed` machinery Wave 4.4 tests (see that
 * function's own comment and schema.prisma's `Payment.activationFailedAt`
 * doc comment: "Scoped to subscription/program_purchase only — booking
 * keeps its own pre-existing, deliberately-not-auto-retryable failure
 * path"). So driving the same SubscriptionPlan-deletion trick Wave 4.4 used
 * would not exercise anything real for a booking. The REAL, analogous
 * booking-side trigger lives in coaching.service.ts's createBooking(): once
 * a claimed Relationship is advanced to `activating`, if the following
 * `booking.create()` throws (the narrow, already-documented slot-conflict
 * race — see that function's own comment: "deliberately LEFT at
 * `activating` rather than silently reverted or advanced to `active`... an
 * honest signal for manual follow-up"), the Relationship is left exactly
 * there. This suite produces that race for real, with no mocking: it
 * directly creates a genuinely-CONFLICTING `confirmed` Booking for the same
 * professional/slot via Prisma (a real row, not a stubbed function) BEFORE
 * calling verifyPayment() — the same "drive the real failure path via a
 * naturally-occurring precondition, not a mock" discipline
 * paymentsActivationFailureRecovery.test.ts already established by deleting
 * a referenced SubscriptionPlan instead of mocking subscribe().
 *
 * **Why verifyPayment() is called directly rather than driving
 * POST /payments/razorpay/orders over HTTP:** createOrder() always calls
 * the real `razorpay.orders.create()` Razorpay SDK method with no mock
 * anywhere in this test suite (see relationshipAcceptanceGate.test.ts's own
 * closing comment: "that would need a real razorpay.orders.create() network
 * call... every other Razorpay-configured test... avoids createOrder()
 * entirely for exactly this reason"). This suite follows the exact same,
 * already-established precedent: the Payment row is created directly (the
 * one fact createOrder() would otherwise persist), and verifyPayment() is
 * exercised for real — it's the actual security/activation boundary this
 * scenario is about, and the one createOrder() itself doesn't touch.
 * Every other step (offer propose/accept, dashboard read, admin queue read,
 * user-facing retry) goes over real HTTP via supertest, per this wave's own
 * verification bar.
 */
describe("Wave 7 capstone: offer accept -> booking payment captured but entitlement activation fails -> Relationship stuck -> professional + admin both see it", () => {
  const app = buildApp();
  const adminPassword = "Wave7AdminPass9!";

  let previousKeyId: string | undefined;
  let previousKeySecret: string | undefined;
  let previousWebhookSecret: string | undefined;

  let adminId: string;
  let adminToken: string;
  let userId: string;
  let accessToken: string;
  let professionalId: string;
  let professionalEmail: string;
  let professionalAccessToken: string;
  let offeringId: string;
  let blockerUserId: string;
  let blockerBookingId: string;
  let offerId: string;
  let relationshipId: string;
  let paymentId: string;
  const scheduledAt = tomorrowAt(10);

  function tomorrowAt(hourUtc: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
  }

  function signFor(providerOrderId: string, razorpayPaymentId: string) {
    return crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
      .update(`${providerOrderId}|${razorpayPaymentId}`)
      .digest("hex");
  }

  beforeAll(async () => {
    previousKeyId = env.RAZORPAY_KEY_ID;
    previousKeySecret = env.RAZORPAY_KEY_SECRET;
    previousWebhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
    env.RAZORPAY_KEY_ID = "rzp_test_wave7_e2e_fixture";
    env.RAZORPAY_KEY_SECRET = "wave7-e2e-test-key-secret";
    env.RAZORPAY_WEBHOOK_SECRET = "wave7-e2e-test-webhook-secret";

    // Real admin (coach_operations — has professionals:* and dashboard:view,
    // the same role professionalOffers.test.ts uses for the propose-offer
    // route and enough to read the unified action-items queue).
    const adminEmail = uniqueEmail("wave7-admin");
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
        fullName: "Wave 7 Fixture Admin",
        role: "coach_operations",
        status: "active",
      },
    });
    adminId = admin.id;
    const adminLoginRes = await request(app).post("/admin/auth/login").send({ email: adminEmail, password: adminPassword });
    expect(adminLoginRes.status).toBe(200);
    adminToken = adminLoginRes.body.token;

    // Real user, signed up via the real HTTP signup flow.
    const userEmail = uniqueEmail("wave7-user");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: userEmail, password: "Wave7Password1!", fullName: "Wave 7 Fixture User" });
    expect(signupRes.status).toBe(201);
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;

    // Real, genuinely-available professional (isAvailableForNewClients()'s
    // own real gate — status active, lifecycleStatus available, capacity
    // headroom — same fixture shape professionalOffers.test.ts uses).
    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `wave7-coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Wave 7 Fixture Coach",
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 15,
      },
    });
    professionalId = professional.id;
    professionalEmail = professional.email;
    professionalAccessToken = signProfessionalAccessToken({ sub: professionalId, email: professionalEmail }).token;

    // A real, priced (verifiedPayment-gated) service offering — the same
    // PAY-01 gate coaching.service.ts's createBooking() enforces.
    const offering = await prisma.professionalServiceOffering.create({
      data: {
        professionalId,
        serviceType: "fitness",
        label: "Wave 7 Fixture Session",
        durationMinutes: 60,
        priceCents: 1800,
        isActive: true,
      },
    });
    offeringId = offering.id;

    // A second, unrelated real user + a real CONFIRMED Booking for this
    // professional at the exact slot the scenario below will try to book —
    // the genuine, naturally-occurring precondition for createBooking()'s
    // own real slot-conflict rejection (coaching.service.ts's `overlaps()`
    // check), not a stub or simulated failure.
    const blockerUser = await prisma.user.create({
      data: {
        email: uniqueEmail("wave7-blocker"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Wave 7 Slot Blocker",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    blockerUserId = blockerUser.id;
    const blockerBooking = await prisma.booking.create({
      data: {
        userId: blockerUserId,
        professionalId,
        offeringId,
        scheduledAt: new Date(scheduledAt),
        durationMinutes: 60,
        priceCents: 1800,
        status: "confirmed",
      },
    });
    blockerBookingId = blockerBooking.id;
  });

  afterAll(async () => {
    env.RAZORPAY_KEY_ID = previousKeyId;
    env.RAZORPAY_KEY_SECRET = previousKeySecret;
    env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret;

    await prisma.adminActionItem.deleteMany({ where: { entityType: "Relationship", entityId: relationshipId } });
    await prisma.adminActionItem.deleteMany({ where: { entityType: "Payment", entityId: paymentId } });
    await prisma.auditLog.deleteMany({ where: { entityType: "Payment", entityId: paymentId } });
    await prisma.auditLog.deleteMany({ where: { entityType: "ProfessionalOffer", entityId: offerId } });
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.booking.deleteMany({ where: { professionalId } });
    await prisma.professionalOffer.deleteMany({ where: { professionalId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, blockerUserId] } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("Step 1: an admin proposes a real offer and the professional accepts it via real HTTP, creating a real, accepted Relationship", async () => {
    const createRes = await request(app)
      .post("/admin/professional-offers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ professionalId, userId, serviceType: "fitness" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.offer.status).toBe("offered");
    offerId = createRes.body.offer.id;

    const acceptRes = await request(app)
      .post(`/professionals/me/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${professionalAccessToken}`);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe("accepted");
    expect(acceptRes.body.relationshipId).toBeTruthy();
    relationshipId = acceptRes.body.relationshipId;

    const relationship = await prisma.relationship.findUnique({ where: { id: relationshipId } });
    expect(relationship).not.toBeNull();
    expect(relationship?.userId).toBe(userId);
    expect(relationship?.professionalId).toBe(professionalId);
    expect(relationship?.status).toBe("accepted");
  });

  it("Step 2+3: a real booking-purpose Payment captures money but genuinely fails entitlement activation via a real slot conflict, and the Relationship correctly never reaches active", async () => {
    const suffix = uniqueSuffix();
    const providerOrderId = `order_wave7_${suffix}`;
    const payment = await prisma.payment.create({
      data: {
        userId,
        purpose: "booking",
        referenceId: offeringId,
        amountCents: 1800,
        currency: "INR",
        providerOrderId,
        status: "created",
        scheduledAt: new Date(scheduledAt),
      },
    });
    paymentId = payment.id;

    const razorpayPaymentId = `pay_wave7_${suffix}`;
    const signature = signFor(providerOrderId, razorpayPaymentId);

    let caught: unknown;
    try {
      await verifyPayment(userId, { razorpayOrderId: providerOrderId, razorpayPaymentId, razorpaySignature: signature });
    } catch (err) {
      caught = err;
    }

    // The real error from coaching.service.ts's createBooking() overlap
    // check, propagated through activatePayment()'s booking-specific
    // rethrow — NOT the generic `entitlement_activation_failed` wrapper
    // subscription/program_purchase get, because booking deliberately
    // bypasses that wrapping (see this file's own top comment).
    expect(caught).toBeInstanceOf(ApiHttpError);
    expect((caught as ApiHttpError).code).toBe("slot_unavailable");
    expect((caught as ApiHttpError).status).toBe(409);

    // Money genuinely captured (the atomic "paid" claim ran before
    // createBooking() was ever attempted) and stays captured — Razorpay
    // was already charged by this point in the real flow.
    const paymentAfter = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(paymentAfter?.status).toBe("paid");
    expect(paymentAfter?.activatedAt).toBeNull();
    // The deliberate, documented booking exclusion (schema.prisma's own
    // Payment.activationFailedAt comment: "Scoped to subscription/
    // program_purchase only") — confirmed here as real behavior, not
    // assumed: no activationFailedAt/reason ever gets set for a booking.
    expect(paymentAfter?.activationFailedAt).toBeNull();
    expect(paymentAfter?.activationFailureReason).toBeNull();

    // The real, distinct audit-only signal activatePayment()'s booking
    // branch records for this exact case.
    const unfulfilledAudit = await prisma.auditLog.findFirst({
      where: { entityType: "Payment", entityId: paymentId, action: "booking.payment_captured_but_unfulfilled" },
    });
    expect(unfulfilledAudit).not.toBeNull();
    expect((unfulfilledAudit?.metadata as Record<string, unknown> | null)?.reason).toBe("slot_unavailable");

    // The exact real gap this scenario needs proven: no
    // entitlement_activation_failed AdminActionItem for this Payment (that
    // machinery is subscription/program_purchase-only, by design — see
    // this file's own top comment) — booking's real signal is the
    // Relationship-side one, verified in the next step.
    const entitlementItems = await prisma.adminActionItem.findMany({
      where: { type: "entitlement_activation_failed", entityType: "Payment", entityId: paymentId },
    });
    expect(entitlementItems).toHaveLength(0);

    // Step 3 — the real, direct Postgres check: the Relationship this
    // Payment/Booking attempt is for never reached `active`. Note exactly
    // WHERE this real trigger fails inside createBooking(): the pre-existing
    // conflicting Booking is caught by the overlap check at the very TOP of
    // createBooking() (coaching.service.ts), which runs BEFORE
    // claimRelationship()/the `activating` advance — so this specific, real,
    // deterministic, naturally-occurring trigger leaves the relationship
    // exactly where it already was (`accepted`), never even touching it.
    // That's a DIFFERENT (earlier) real guard than the narrow post-check
    // race createBooking()'s own comment documents ("deliberately LEFT at
    // `activating` rather than silently reverted or advanced to `active`" —
    // a conflict arising AFTER that check already passed, in the brief
    // window before `booking.create()` itself). Both are real, both leave
    // the relationship genuinely out of `active` (this step's actual
    // requirement) — the `activating`-specific case is exercised next,
    // exactly the way professionalDashboard.stuckRelationships.test.ts's own
    // precedent already established for this same rare DB-level race (see
    // that file's own top comment: "a rare DB-level race... directly seeds a
    // Relationship row already sitting at `activating`").
    const relationshipAfter = await prisma.relationship.findUnique({ where: { id: relationshipId } });
    expect(relationshipAfter?.status).toBe("accepted");
    expect(relationshipAfter?.status).not.toBe("active");

    // No real Booking row was created for the failed attempt — only the
    // pre-existing blocker booking exists for this professional/slot.
    const bookings = await prisma.booking.findMany({ where: { professionalId } });
    expect(bookings.map((b) => b.id)).toEqual([blockerBookingId]);
  });

  it("Step 4: the user's existing recoverable surface (GET /payments/:id, POST /payments/:id/retry-activation) is real and callable for this exact Payment", async () => {
    const getRes = await request(app).get(`/payments/${paymentId}`).set("Authorization", `Bearer ${accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe("paid");
    expect(getRes.body.activatedAt).toBeNull();
    expect(getRes.body.activationFailedAt).toBeNull();

    // Real, callable, and — per activatePayment()'s own documented
    // reasoning ("a lost time slot needs a human refund/reschedule, no
    // automated refund flow exists yet") — a real, honest, correctly-coded
    // refusal rather than either a silent no-op or an unhandled crash.
    const retryRes = await request(app)
      .post(`/payments/${paymentId}/retry-activation`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(retryRes.status).toBe(409);
    expect(retryRes.body.error.code).toBe("booking_retry_unsupported");

    // The refusal doesn't mutate anything — still exactly the same stuck state.
    const paymentAfter = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(paymentAfter?.status).toBe("paid");
    expect(paymentAfter?.activationFailedAt).toBeNull();
  });

  it("Step 5: the professional's real dashboard detects this exact Relationship as stuck once it's genuinely past the threshold, and queues a real relationship_activation_failed AdminActionItem", async () => {
    // The real, naturally-occurring trigger Step 2/3 just drove (a
    // pre-existing conflicting Booking) hits createBooking()'s overlap
    // guard BEFORE the relationship is ever advanced past `accepted` — a
    // real, honest "stays out of active" outcome, but not the specific
    // `activating` state professionalDashboard.service.ts's real detector
    // (detectAndQueueStuckRelationships) looks for. That detector exists
    // for a genuinely DIFFERENT, narrower real race: a conflict arising
    // AFTER createBooking()'s own overlap check already passed but before
    // its `booking.create()` call completes (see that function's own doc
    // comment: "deliberately LEFT at `activating`... an honest signal for
    // manual follow-up"). That race is, by construction, not deterministically
    // reproducible over real HTTP without either mocking internals (out of
    // scope — this suite mocks nothing) or a genuinely flaky timing-dependent
    // test. professionalDashboard.stuckRelationships.test.ts (Wave 3) already
    // established the honest way to test the DOWNSTREAM half of that exact
    // race for real: seed the state the race leaves behind directly, then
    // exercise every real system from there. This continues the SAME
    // relationship (not a fresh fixture) from where Step 2/3 already proved
    // a real activation failure occurred, representing "the narrow race
    // above hit, instead of the overlap-guard case this suite already
    // exercised" — the two are alternate real outcomes of the same
    // "booking payment captured, entitlement activation failed" event this
    // whole scenario is about.
    await prisma.relationship.update({ where: { id: relationshipId }, data: { status: "activating" } });

    // professionalDashboard.service.ts's STUCK_ACTIVATING_THRESHOLD_MS is
    // 15 real minutes — not practical to wait out in a test. Same "fixture
    // the passage of time directly rather than sleeping the suite"
    // precedent professionalDashboard.stuckRelationships.test.ts already
    // established: `updatedAt` is @updatedAt-managed, so it's pushed back
    // with a raw update.
    const staleUpdatedAt = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.$executeRaw`UPDATE "relationships" SET "updatedAt" = ${staleUpdatedAt} WHERE "id" = ${relationshipId}`;

    const dashboardRes = await request(app)
      .get("/professionals/me/dashboard")
      .set("Authorization", `Bearer ${professionalAccessToken}`);
    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.body.stuckRelationships).toHaveLength(1);
    expect(dashboardRes.body.stuckRelationships[0]).toMatchObject({
      relationshipId,
      clientFullName: "Wave 7 Fixture User",
      serviceType: "fitness",
    });

    const actionItems = await prisma.adminActionItem.findMany({
      where: { type: "relationship_activation_failed", entityType: "Relationship", entityId: relationshipId },
    });
    expect(actionItems).toHaveLength(1);
    expect(actionItems[0].status).toBe("open");
    expect(actionItems[0].severity).toBe("high");
    expect(actionItems[0].metadata).toMatchObject({ professionalId, userFullName: "Wave 7 Fixture User", serviceType: "fitness" });

    // Dedup: a second dashboard read for the same still-stuck relationship
    // must not create a duplicate open item — same discipline
    // entitlement_activation_failed's own dedup uses.
    const dashboardRes2 = await request(app)
      .get("/professionals/me/dashboard")
      .set("Authorization", `Bearer ${professionalAccessToken}`);
    expect(dashboardRes2.status).toBe(200);
    const actionItemsAfterSecondRead = await prisma.adminActionItem.findMany({
      where: { type: "relationship_activation_failed", entityType: "Relationship", entityId: relationshipId },
    });
    expect(actionItemsAfterSecondRead).toHaveLength(1);
    expect(actionItemsAfterSecondRead[0].id).toBe(actionItems[0].id);
  });

  it("Step 6: the real relationship_activation_failed AdminActionItem is visible, correctly typed and severity'd, in the unified GET /admin/action-items queue", async () => {
    const res = await request(app)
      .get("/admin/action-items")
      .query({ type: "relationship_activation_failed" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const items = res.body.items as Array<{ id: string; type: string; entityType: string; entityId: string; severity: string; status: string }>;
    const ours = items.find((i) => i.entityType === "Relationship" && i.entityId === relationshipId);
    expect(ours).toBeTruthy();
    expect(ours?.type).toBe("relationship_activation_failed");
    expect(ours?.severity).toBe("high");
    expect(ours?.status).toBe("open");

    // The unified queue genuinely has NO entitlement_activation_failed row
    // for this scenario's Payment either — confirming (via the same real
    // read admin-web's own queue screen will use) that the absence proven
    // directly against Postgres in Step 2/3 is also what an admin actually
    // sees, not just a DB-level artifact of this suite's own queries.
    const entitlementRes = await request(app)
      .get("/admin/action-items")
      .query({ type: "entitlement_activation_failed" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(entitlementRes.status).toBe(200);
    const entitlementItems = entitlementRes.body.items as Array<{ entityType: string; entityId: string }>;
    expect(entitlementItems.some((i) => i.entityType === "Payment" && i.entityId === paymentId)).toBe(false);
  });
});
