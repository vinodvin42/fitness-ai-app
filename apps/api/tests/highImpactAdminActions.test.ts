import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { CONFIRMATION_WORD, MIN_REASON_LENGTH, assertHighImpactConfirmed } from "../src/lib/highImpactAction";

const app = buildApp();

/**
 * Acceptance test 16 (spec §11): "Every high-impact admin action is
 * refused without a reason and typed confirmation, and writes an
 * immutable audit event." BR-ADM-005 says the same thing as a rule.
 *
 * Before R1 this failed by construction: `createRefundSchema` declared
 * `reason` as `.optional()`, and no typed-confirmation mechanism existed
 * anywhere in the codebase. The admin console rendered a confirmation
 * step, but a confirmation the server never checks is theatre — and the
 * spec's own Definition of Done requires every rule to be "enforced by
 * the API, not only hidden in the UI", which is what these tests assert.
 */
describe("BR-ADM-005 / acceptance test 16 — high-impact admin actions", () => {
  let adminToken: string;
  let adminId: string;
  let paymentId: string;
  let userId: string;
  let planId: string;
  const AMOUNT_CENTS = 150000;
  const ADMIN_PASSWORD = "AdminPass123!";

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-highimpact-${suffix}@example.com`,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        fullName: "High Impact Fixture Admin",
        role: "super_admin",
        status: "active",
      },
    });
    adminId = admin.id;

    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    adminToken = login.body.token;
    expect(adminToken).toBeTruthy();

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("highimpact"),
        passwordHash: await hashPassword("unused"),
        fullName: "High Impact Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;

    planId = `plan-highimpact-${suffix}`;
    await prisma.subscriptionPlan.create({
      data: {
        id: planId,
        tier: "pro",
        name: "High Impact Fixture Plan",
        priceCents: AMOUNT_CENTS,
        billingCycle: "monthly",
        isActive: true,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        userId,
        purpose: "subscription",
        referenceId: planId,
        amountCents: AMOUNT_CENTS,
        currency: "INR",
        providerOrderId: `order_highimpact_${suffix}`,
        status: "paid",
      },
    });
    paymentId = payment.id;
  });

  afterAll(async () => {
    await prisma.adminActionItem.deleteMany({ where: { entityType: "Refund" } });
    await prisma.refund.deleteMany({ where: { paymentId } });
    await prisma.expense.deleteMany({ where: { recordedByAdminId: adminId } });
    await prisma.payment.deleteMany({ where: { id: paymentId } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  async function refund(body: Record<string, unknown>) {
    return request(app)
      .post(`/admin/payments/${paymentId}/refunds`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);
  }

  it("refuses a refund with no reason at all, and writes nothing", async () => {
    const res = await refund({ amountCents: 1000, confirmation: CONFIRMATION_WORD });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.refund.count({ where: { paymentId } })).toBe(0);
  });

  it("refuses a reason too short to be an audit trail", async () => {
    const res = await refund({ amountCents: 1000, reason: "ok", confirmation: CONFIRMATION_WORD });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.refund.count({ where: { paymentId } })).toBe(0);
  });

  it("refuses a real reason with no typed confirmation", async () => {
    const res = await refund({ amountCents: 1000, reason: "Duplicate charge confirmed by finance" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.refund.count({ where: { paymentId } })).toBe(0);
  });

  it("refuses a confirmation that is close but not exact", async () => {
    const res = await refund({
      amountCents: 1000,
      reason: "Duplicate charge confirmed by finance",
      confirmation: "resolve please",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.refund.count({ where: { paymentId } })).toBe(0);
  });

  it("accepts a real reason plus the exact confirmation, and writes an audit row carrying both", async () => {
    const reason = "Duplicate charge confirmed by finance, ticket 8812";
    const res = await refund({ amountCents: 1000, reason, confirmation: CONFIRMATION_WORD });
    expect(res.status).toBe(201);

    const stored = await prisma.refund.findFirst({ where: { paymentId } });
    expect(stored?.reason).toBe(reason);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Refund", entityId: stored!.id, action: { in: ["refund.recorded", "refund.processed"] } },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorAdminId).toBe(adminId);
    expect(audit?.ruleId).toBe("BR-COM-012");
    expect(audit?.stateAfter).toMatchObject({ refundedCents: 1000 });
    expect(audit?.metadata).toMatchObject({ reason });
  });

  it("keeps the audit trail immutable — nothing in the codebase updates or deletes an audit row", async () => {
    // Asserted as a property of the code rather than by attempting a
    // write: Prisma would happily update the row, so the guarantee lives
    // in there being no such call site. This is the cheap regression
    // guard on that (spec §11: "writes an immutable audit event").
    const { execSync } = await import("node:child_process");
    const hits = execSync(
      "grep -rn 'auditLog\\.\\(update\\|delete\\|upsert\\)' src || true",
      { cwd: process.cwd(), encoding: "utf8" },
    ).trim();
    expect(hits).toBe("");
  });

  describe("the guard itself", () => {
    it("returns the trimmed reason when both gates pass", () => {
      expect(
        assertHighImpactConfirmed({ reason: "  a perfectly good reason  ", confirmation: CONFIRMATION_WORD }),
      ).toBe("a perfectly good reason");
    });

    it("rejects a reason of exactly one character below the floor", () => {
      expect(() =>
        assertHighImpactConfirmed({ reason: "x".repeat(MIN_REASON_LENGTH - 1), confirmation: CONFIRMATION_WORD }),
      ).toThrowError(/reason/i);
    });

    it("rejects a lower-case confirmation", () => {
      expect(() =>
        assertHighImpactConfirmed({ reason: "a perfectly good reason", confirmation: "resolve" }),
      ).toThrowError(/RESOLVE/);
    });
  });
});
