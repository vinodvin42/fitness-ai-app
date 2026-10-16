/**
 * Scenario F — Payments and access: local test payment → verified
 * entitlement → expiry, cancellation and refund behaviour.
 *
 * Surfaces: user-mobile (api/payments.ts, api/subscriptions.ts,
 * api/checkout.ts), admin-web (screens/commerce/RefundsScreen.tsx,
 * screens/approvals/ApprovalsScreen.tsx).
 *
 * Policy status (Batch 0 business-config inventory): renewal, expiry of a
 * subscription that was not cancelled, and what a refund does to access
 * are NOT decided. For those, this journey records CURRENT behaviour
 * (verdict "current-behaviour") and marks the intended acceptance
 * criterion "blocked" pending the decision. It does not invent a policy.
 *
 * Time travel: to observe period-end behaviour without waiting a month,
 * F3/F4 move Subscription.renewsAt into the past directly in the
 * disposable database. That is a test manipulation, named as such.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/db/prisma";
import {
  CONFIGURATION,
  bearer,
  buyTestPlan,
  describeResponse,
  loginAdmin,
  loginUser,
  record,
  startJourney,
  type Journey,
} from "./harness/journey";

const S = "F";
const PAST = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
let j: Journey;
let userA = "";
let userB = "";
let finance = "";
let superAdmin = "";
let paymentA = "";
let paymentB = "";

beforeAll(async () => {
  j = startJourney();
  userA = await loginUser(j, j.world.userA.email);
  userB = await loginUser(j, j.world.userB.email);
  finance = await loginAdmin(j, j.world.adminFinance.email);
  superAdmin = await loginAdmin(j, j.world.adminSuper.email);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("F. Payment → entitlement → cancel / expiry / refund", () => {
  it("F1 a verified test payment grants access to the paid plan", async () => {
    const before = await request(j.app).get("/subscriptions/me").set(bearer(userA));
    const buy = await buyTestPlan(j, userA);
    const row = await prisma.payment.findUnique({ where: { providerOrderId: buy.orderId } });
    paymentA = row?.id ?? "";
    const after = await request(j.app).get("/subscriptions/me").set(bearer(userA));
    const sub = after.body?.subscription;
    const ok =
      buy.verify.status === 200 &&
      row?.status === "paid" &&
      sub?.planId === j.world.plan.id &&
      sub?.status === "active" &&
      sub?.plan?.tier === "grow";
    record({
      scenario: S,
      check: "F1 payment → entitlement",
      surface: "user-mobile",
      configuration: CONFIGURATION + "; TEST-ONLY ₹1 plan",
      endpoints: ["GET /subscriptions/me", "POST /payments/razorpay/orders", "POST /payments/razorpay/verify"],
      files: ["apps/user-mobile/src/api/subscriptions.ts", "apps/api/src/modules/payments/payments.service.ts", "apps/api/src/modules/subscriptions/subscriptions.service.ts"],
      recordsWritten: [`Payment ${paymentA}`, "Subscription (active)", "Invoice", "Notification (payment activation)"],
      recordsRead: ["Subscription via GET /subscriptions/me"],
      expected: "before: no paid subscription; after verify: active subscription on the TEST-ONLY plan (tier grow)",
      observed: `before=${before.body?.subscription?.status ?? "none"}; verify ${describeResponse(buy.verify)}; payment=${row?.status}; after=${sub?.status} tier=${sub?.plan?.tier} displayState=${sub?.displayState}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("F2 another user cannot read this payment", async () => {
    const res = await request(j.app).get(`/payments/${paymentA}`).set(bearer(userB));
    const ok = res.status === 404;
    record({
      scenario: S,
      check: "F2 payment ownership",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["GET /payments/:id"],
      files: ["apps/api/src/modules/payments/payments.service.ts"],
      recordsWritten: [],
      recordsRead: [`Payment ${paymentA}`],
      expected: "404 for user B",
      observed: describeResponse(res),
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("F3 cancellation: access continues to the period end, then ends (current behaviour)", async () => {
    const cancel = await request(j.app).post("/subscriptions/cancel").set(bearer(userA));
    const during = await request(j.app).get("/subscriptions/me").set(bearer(userA));
    const sub = await prisma.subscription.findFirst({ where: { userId: j.world.userA.id, status: "active" }, orderBy: { createdAt: "desc" } });
    if (sub) await prisma.subscription.update({ where: { id: sub.id }, data: { renewsAt: PAST() } }); // test time travel
    const afterEnd = await request(j.app).get("/subscriptions/me").set(bearer(userA));
    const observed =
      `cancel ${describeResponse(cancel)} cancelAtPeriodEnd=${cancel.body?.cancelAtPeriodEnd}; during period status=${during.body?.subscription?.status} ` +
      `displayState=${during.body?.subscription?.displayState}; after period end status=${afterEnd.body?.subscription?.status ?? "none"} displayState=${afterEnd.body?.subscription?.displayState ?? "none"}`;
    record({
      scenario: S,
      check: "F3 cancel → access until period end → expired",
      surface: "user-mobile",
      configuration: CONFIGURATION + "; renewsAt moved into the past in the disposable DB",
      endpoints: ["POST /subscriptions/cancel", "GET /subscriptions/me"],
      files: ["apps/user-mobile/src/api/subscriptions.ts", "apps/api/src/modules/subscriptions/subscriptions.service.ts (cancelSubscription, maybeExpireLapsed)"],
      recordsWritten: ["Subscription.cancelAtPeriodEnd", "Subscription.renewsAt (test manipulation)", "Subscription.status (lazy expiry on read)"],
      recordsRead: ["Subscription via GET /subscriptions/me"],
      expected: "Code as written: active with cancelAtPeriodEnd until renewsAt, then 'expired' on the next read",
      observed,
      verdict: "current-behaviour",
      notes: "Cancellation policy is not formally approved. Expiry happens lazily when the subscription is read; there is no scheduled job.",
    });
    expect(cancel.status).toBe(200);
  });

  it("F4 a subscription that was not cancelled, past its period end (current behaviour; policy blocked)", async () => {
    const buy = await buyTestPlan(j, userB);
    const row = await prisma.payment.findUnique({ where: { providerOrderId: buy.orderId } });
    paymentB = row?.id ?? "";
    const sub = await prisma.subscription.findFirst({ where: { userId: j.world.userB.id, status: "active" }, orderBy: { createdAt: "desc" } });
    if (sub) await prisma.subscription.update({ where: { id: sub.id }, data: { renewsAt: PAST() } }); // test time travel
    const read = await request(j.app).get("/subscriptions/me").set(bearer(userB));
    const status = read.body?.subscription?.status;
    record({
      scenario: S,
      check: "F4 no cancel, period ended",
      surface: "user-mobile",
      configuration: CONFIGURATION + "; renewsAt moved into the past in the disposable DB",
      endpoints: ["GET /subscriptions/me"],
      files: ["apps/api/src/modules/subscriptions/subscriptions.service.ts"],
      recordsWritten: [`Payment ${paymentB}`, "Subscription.renewsAt (test manipulation)"],
      recordsRead: ["Subscription via GET /subscriptions/me"],
      expected: "Current code: no renewal charge and no expiry, so it stays active",
      observed: `verify ${describeResponse(buy.verify)}; status after period end=${status} displayState=${read.body?.subscription?.displayState}`,
      verdict: "current-behaviour",
    });
    record({
      scenario: S,
      check: "F4 intended: access renews (with payment) or ends at period end",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["GET /subscriptions/me"],
      files: ["apps/api/src/modules/subscriptions/subscriptions.service.ts"],
      recordsWritten: [],
      recordsRead: [],
      expected: "Not defined yet",
      observed: `Currently stays ${status}`,
      verdict: "blocked",
      blockedBy: "Renewal/expiry policy decision (auto-renew vs end of access; grace period)",
    });
    expect(buy.verify.status).toBe(200);
  });

  it("F5 refund raised from the admin screen's request shape", async () => {
    // Exactly the body RefundsScreen.tsx sends: amountCents + reason, no
    // typed confirmation. (admin-web's api.ts adds no X-Change-Reason header
    // here because the body already carries a reason of 10+ characters.)
    const res = await request(j.app)
      .post(`/admin/payments/${paymentB}/refunds`)
      .set(bearer(finance))
      .send({ amountCents: j.world.plan.priceCents, reason: "TEST-ONLY refund raised the way the admin screen does" });
    let replay: request.Response | null = null;
    if (res.status === 202 && res.body?.approvalRequest?.id) {
      replay = await request(j.app).post(`/admin/approvals/${res.body.approvalRequest.id}/approve`).set(bearer(superAdmin)).send({ note: "TEST-ONLY approval" });
    }
    const refunds = await prisma.refund.count({ where: { paymentId: paymentB } });
    const finalStatus = replay ? replay.body?.approval?.resultStatus : res.status;
    const ok = refunds === 1 && (finalStatus === 201 || finalStatus === 200);
    record({
      scenario: S,
      check: "F5 admin-web refund request shape",
      surface: "admin-web",
      configuration: CONFIGURATION + "; finance raises (maker), super_admin approves (checker)",
      endpoints: ["POST /admin/payments/:id/refunds", "POST /admin/approvals/:id/approve"],
      files: ["apps/admin-web/src/screens/commerce/RefundsScreen.tsx", "apps/api/src/modules/adminRefunds/adminRefunds.schema.ts", "apps/api/src/lib/highImpactAction.ts"],
      recordsWritten: ["ApprovalRequest", refunds ? "Refund" : "(no refund)"],
      recordsRead: ["Refund count for the payment"],
      expected: "the screen's request leads to one refund after approval",
      observed: `raise ${describeResponse(res)}; approve ${replay ? describeResponse(replay) + " resultStatus=" + replay.body?.approval?.resultStatus : "not reached"}; refunds=${refunds}`,
      verdict: ok ? "passed" : "failed",
      notes: "Source: the API requires confirmation \"RESOLVE\" but RefundsScreen.tsx does not send it. If failed, that mismatch is the likely cause.",
    });
    expect(ok).toBe(true);
  });

  it("F6 refund with the API's full contract; effect on access (current behaviour; policy blocked)", async () => {
    const existing = await prisma.refund.count({ where: { paymentId: paymentB } });
    let raise: request.Response | null = null;
    let approve: request.Response | null = null;
    if (existing === 0) {
      raise = await request(j.app)
        .post(`/admin/payments/${paymentB}/refunds`)
        .set(bearer(finance))
        .send({ amountCents: j.world.plan.priceCents, reason: "TEST-ONLY full refund for the harness", confirmation: "RESOLVE" });
      if (raise.status === 202 && raise.body?.approvalRequest?.id) {
        approve = await request(j.app).post(`/admin/approvals/${raise.body.approvalRequest.id}/approve`).set(bearer(superAdmin)).send({ note: "TEST-ONLY approval" });
      }
    }
    const refund = await prisma.refund.findFirst({ where: { paymentId: paymentB }, orderBy: { createdAt: "desc" } });
    const payment = await prisma.payment.findUnique({ where: { id: paymentB } });
    const purchases = await request(j.app).get("/checkout/purchases").set(bearer(userB));
    const shown = (Array.isArray(purchases.body) ? purchases.body : []).find((p: { id: string }) => p.id === paymentB);
    const access = await request(j.app).get("/subscriptions/me").set(bearer(userB));
    const refundRecorded = !!refund && shown?.refund?.refundedCents === j.world.plan.priceCents;
    record({
      scenario: S,
      check: "F6 refund recorded and visible to the user",
      surface: "admin-web → user-mobile",
      configuration: CONFIGURATION + "; mock provider refund (no network)",
      endpoints: ["POST /admin/payments/:id/refunds", "POST /admin/approvals/:id/approve", "GET /checkout/purchases"],
      files: ["apps/api/src/modules/adminRefunds/adminRefunds.service.ts", "apps/api/src/modules/checkout/checkout.service.ts", "apps/user-mobile/src/api/checkout.ts"],
      recordsWritten: ["ApprovalRequest", "Refund", "Expense (if processed)"],
      recordsRead: ["Refund", "Payment", "Purchase history for user B"],
      expected: "one refund for the full amount; the user's purchase history shows it",
      observed:
        `${raise ? `raise ${describeResponse(raise)}; ` : "refund already present from F5; "}${approve ? `approve ${describeResponse(approve)} resultStatus=${approve.body?.approval?.resultStatus}; ` : ""}` +
        `refund=${refund?.status ?? "none"} ${refund?.amountCents ?? 0}; payment status=${payment?.status}; user sees refundedCents=${shown?.refund?.refundedCents ?? "none"}`,
      verdict: refundRecorded ? "passed" : "failed",
    });
    record({
      scenario: S,
      check: "F6 access after a full refund",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["GET /subscriptions/me"],
      files: ["apps/api/src/modules/adminRefunds/adminRefunds.service.ts", "apps/api/src/modules/subscriptions/subscriptions.service.ts"],
      recordsWritten: [],
      recordsRead: ["Subscription via GET /subscriptions/me"],
      expected: "Current code: a refund does not change the subscription",
      observed: `subscription status after full refund=${access.body?.subscription?.status ?? "none"}`,
      verdict: "current-behaviour",
    });
    record({
      scenario: S,
      check: "F6 intended: what a refund does to access",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: [],
      files: [],
      recordsWritten: [],
      recordsRead: [],
      expected: "Not defined yet",
      observed: `Currently ${access.body?.subscription?.status ?? "none"} after a full refund`,
      verdict: "blocked",
      blockedBy: "Refund terms decision (legal/terms-of-service.md is marked [NEEDS A REAL POLICY])",
    });
    expect(refundRecorded).toBe(true);
  });
});
