/**
 * Scenario E — Referral and commission: synthetic creator attribution →
 * eligible test payment → expected commission record; duplicate payment
 * events.
 *
 * Surfaces: user-mobile (signup with acquisitionContext "creator:<code>",
 * apps/user-mobile/src/lib/acquisitionContext.ts; payments via
 * apps/user-mobile/src/api/payments.ts), creator-portal
 * (apps/creator-portal/src/screens/CommissionScreen.tsx).
 *
 * Intended behaviour under test: an attributed user's verified payment
 * produces one commission for the attributing creator. Source reading says
 * createCommissionForPayment() has no production caller; if so, E3/E4 fail
 * and the failure is reported. Nothing here creates the commission itself.
 * The creator rate (10%) is a TEST-ONLY fixture value.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/db/prisma";
import {
  CONFIGURATION,
  bearer,
  buyTestPlan,
  describeResponse,
  loginCreator,
  record,
  signWebhook,
  startJourney,
  type Journey,
} from "./harness/journey";
import { EMAIL_DOMAIN } from "./harness/syntheticWorld";

const S = "E";
let j: Journey;
let userCId = "";
let userCToken = "";
let creatorToken = "";
let paymentRowId = "";
let orderId = "";
let providerPaymentId = "";

beforeAll(async () => {
  j = startJourney();
  creatorToken = await loginCreator(j, j.world.creator.email);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("E. Creator attribution → payment → commission", () => {
  it("E1 a user who signs up through the creator's link is attributed to the campaign", async () => {
    const signup = await request(j.app)
      .post("/auth/signup")
      .send({
        email: `user-c.${j.world.runId}@${EMAIL_DOMAIN}`,
        password: j.world.password,
        fullName: "TEST-ONLY User C",
        acquisitionContext: `creator:${j.world.creator.linkCode}`,
      });
    userCId = signup.body?.user?.id ?? "";
    userCToken = signup.body?.tokens?.accessToken ?? "";
    const touch = userCId ? await prisma.touchpoint.findFirst({ where: { userId: userCId } }) : null;
    const ok = signup.status === 201 && touch?.campaignId === j.world.creator.campaignId;
    record({
      scenario: S,
      check: "E1 creator link signup → attribution",
      surface: "user-mobile",
      configuration: CONFIGURATION + "; TEST-ONLY campaign link code",
      endpoints: ["POST /auth/signup"],
      files: ["apps/user-mobile/src/lib/acquisitionContext.ts", "apps/api/src/lib/acquisition.ts", "apps/api/src/modules/auth/auth.service.ts"],
      recordsWritten: [`User C ${userCId}`, "Touchpoint (signup)"],
      recordsRead: ["Touchpoint for user C"],
      expected: "201; a signup touchpoint linked to the creator's campaign",
      observed: `${describeResponse(signup)}; touchpoint campaign matches=${touch?.campaignId === j.world.creator.campaignId}; channel=${touch?.channel}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("E2 the attributed user pays for the TEST-ONLY plan and gets access", async () => {
    const buy = await buyTestPlan(j, userCToken);
    orderId = buy.orderId;
    providerPaymentId = buy.providerPaymentId;
    const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId } });
    paymentRowId = payment?.id ?? "";
    const sub = await request(j.app).get("/subscriptions/me").set(bearer(userCToken));
    const ok =
      buy.order.status === 201 &&
      buy.verify.status === 200 &&
      payment?.status === "paid" &&
      sub.body?.subscription?.planId === j.world.plan.id &&
      sub.body?.subscription?.status === "active";
    record({
      scenario: S,
      check: "E2 eligible test payment",
      surface: "user-mobile",
      configuration: CONFIGURATION + "; TEST-ONLY ₹1 plan; local mock signature",
      endpoints: ["POST /payments/razorpay/orders", "POST /payments/razorpay/verify", "GET /subscriptions/me"],
      files: ["apps/user-mobile/src/api/payments.ts", "apps/api/src/modules/payments/payments.service.ts", "apps/api/src/providers/mockProviders.ts"],
      recordsWritten: [`Payment ${paymentRowId}`, "Subscription", "Invoice"],
      recordsRead: ["Payment", "Subscription via GET /subscriptions/me"],
      expected: "order 201, verify 200, payment paid, subscription active on the TEST-ONLY plan",
      observed: `order ${describeResponse(buy.order)}; verify ${describeResponse(buy.verify)}; payment=${payment?.status}; subscription=${sub.body?.subscription?.status ?? "none"}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("E3 duplicate verify and duplicate webhooks do not double-charge or double-grant", async () => {
    const reverify = await request(j.app)
      .post("/payments/razorpay/verify")
      .set(bearer(userCToken))
      .send({ razorpayOrderId: orderId, razorpayPaymentId: providerPaymentId, razorpaySignature: "ignored-on-already-paid" });
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { order_id: orderId, id: providerPaymentId } } } });
    const hook = () =>
      request(j.app)
        .post("/payments/razorpay/webhook")
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Signature", signWebhook(raw))
        .send(raw);
    const w1 = await hook();
    const w2 = await hook();
    const payments = await prisma.payment.count({ where: { userId: userCId, status: "paid" } });
    const activeSubs = await prisma.subscription.count({ where: { userId: userCId, status: "active" } });
    const invoices = await prisma.invoice.count({ where: { paymentId: paymentRowId } });
    const ok = reverify.status === 200 && w1.status === 200 && w2.status === 200 && payments === 1 && activeSubs === 1 && invoices === 1;
    record({
      scenario: S,
      check: "E3 duplicate payment events",
      surface: "payment provider (webhook) + user-mobile (verify retry)",
      configuration: CONFIGURATION + "; webhook signed with the TEST-ONLY webhook secret",
      endpoints: ["POST /payments/razorpay/verify (repeat)", "POST /payments/razorpay/webhook ×2"],
      files: ["apps/api/src/modules/payments/payments.service.ts", "apps/api/src/app.ts"],
      recordsWritten: [],
      recordsRead: ["Payment count", "Subscription count", "Invoice count"],
      expected: "all 200; still 1 paid payment, 1 active subscription, 1 invoice",
      observed: `verify ${describeResponse(reverify)}; webhooks ${describeResponse(w1)}, ${describeResponse(w2)}; paid=${payments}, active subs=${activeSubs}, invoices=${invoices}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("E4 the attributing creator gets exactly one commission for the payment", async () => {
    const commissions = await prisma.creatorCommission.findMany({ where: { paymentId: paymentRowId } });
    const ledger = await request(j.app).get("/influencer-portal/commissions").set(bearer(creatorToken));
    const entries: unknown[] = ledger.body?.entries ?? [];
    const ok =
      commissions.length === 1 &&
      commissions[0].influencerId === j.world.creator.id &&
      commissions[0].commissionPct === j.world.creator.commissionPct &&
      ledger.status === 200 &&
      entries.length === 1;
    record({
      scenario: S,
      check: "E4 payment → commission record → creator portal",
      surface: "creator-portal",
      configuration: CONFIGURATION + "; TEST-ONLY creator rate 10%",
      endpoints: ["GET /influencer-portal/commissions"],
      files: [
        "apps/api/src/modules/creatorCommissions/creatorCommissions.service.ts",
        "apps/api/src/modules/payments/payments.service.ts (activatePayment)",
        "apps/creator-portal/src/screens/CommissionScreen.tsx",
      ],
      recordsWritten: [],
      recordsRead: [`CreatorCommission where paymentId=${paymentRowId}`, "Creator ledger"],
      expected: "exactly one CreatorCommission for this payment, for this creator at the fixture rate; one ledger entry",
      observed: `commission rows=${commissions.length}; ledger ${describeResponse(ledger)} entries=${entries.length}`,
      verdict: ok ? "passed" : "failed",
      notes:
        commissions.length === 0
          ? "No commission was created. createCommissionForPayment() has no production caller (source); reported, not implemented."
          : undefined,
    });
    expect(ok).toBe(true);
  });

  it("E5 a payment with a bad signature grants nothing", async () => {
    const order = await request(j.app)
      .post("/payments/razorpay/orders")
      .set(bearer(userCToken))
      .send({ purpose: "subscription", referenceId: j.world.plan.id });
    const bad = await request(j.app)
      .post("/payments/razorpay/verify")
      .set(bearer(userCToken))
      .send({ razorpayOrderId: order.body?.orderId, razorpayPaymentId: "pay_tst_forged", razorpaySignature: "0".repeat(64) });
    const row = order.body?.orderId ? await prisma.payment.findUnique({ where: { providerOrderId: order.body.orderId } }) : null;
    const activeSubs = await prisma.subscription.count({ where: { userId: userCId, status: "active" } });
    const ok = order.status === 201 && bad.status === 400 && row?.status === "failed" && activeSubs === 1;
    record({
      scenario: S,
      check: "E5 forged payment signature",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["POST /payments/razorpay/orders", "POST /payments/razorpay/verify"],
      files: ["apps/api/src/modules/payments/payments.service.ts"],
      recordsWritten: ["Payment (failed)"],
      recordsRead: ["Payment", "Subscription count"],
      expected: "verify 400 invalid_signature; payment failed; no extra access",
      observed: `order ${describeResponse(order)}; verify ${describeResponse(bad)}; payment=${row?.status}; active subs=${activeSubs}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });
});
