import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { splitGstInclusive } from "../src/modules/checkout/checkout.service";

const app = buildApp();

/**
 * U-M1 ("Checkout: plan, price from API, UPI / card / netbanking, 'Have
 * a code?'"), U-M22 ("Refund status in purchase history") and decision
 * #7 ("No hard-coded prices in the app; prices come from the Commerce
 * API").
 *
 * The assertions worth having here are about what the SERVER is
 * responsible for: that the price, the tax split and the method list all
 * come from it, that a bad code degrades instead of failing, and that a
 * refunded purchase tells the user so.
 */
describe("Checkout quote and purchase history (U-M1, U-M22, D3)", () => {
  let token: string;
  let userId: string;
  let planId: string;
  let adminId: string;
  const PRICE_CENTS = 99900; // ₹999.00

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("checkout"), password: "Testpass123!", fullName: "Checkout Probe" });
    expect(signup.status).toBe(201);
    token = signup.body.tokens.accessToken;
    userId = signup.body.user.id;

    planId = `plan-checkout-${suffix}`;
    await prisma.subscriptionPlan.create({
      data: {
        id: planId,
        tier: "pro",
        name: "FynroX Premium",
        priceCents: PRICE_CENTS,
        billingCycle: "monthly",
        isActive: true,
      },
    });

    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-checkout-${suffix}@example.com`,
        passwordHash: await hashPassword("unused"),
        fullName: "Checkout Fixture Admin",
        role: "finance",
        status: "active",
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.refund.deleteMany({ where: { payment: { userId } } });
    await prisma.adminActionItem.deleteMany({ where: { entityType: "Refund" } });
    await prisma.expense.deleteMany({ where: { recordedByAdminId: adminId } });
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: "CHKOUT" } } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  function quote(params: Record<string, string>) {
    return request(app)
      .get("/checkout/quote")
      .query({ purpose: "subscription", referenceId: planId, ...params })
      .set("Authorization", `Bearer ${token}`);
  }

  it("serves the price, the payment methods and the GST line from the server", async () => {
    const res = await quote({});
    expect(res.status).toBe(200);
    expect(res.body.listPriceCents).toBe(PRICE_CENTS);
    expect(res.body.totalCents).toBe(PRICE_CENTS);
    expect(res.body.itemName).toBe("FynroX Premium");
    // Decision: "UPI / card / netbanking", listed by the server so a
    // gateway change is not an app release.
    expect(res.body.methods.map((m: { id: string }) => m.id)).toEqual(["upi", "card", "netbanking"]);
  });

  it("shows GST as included in the total, not added to it (D3)", async () => {
    const res = await quote({});
    expect(res.body.gst.inclusive).toBe(true);
    expect(res.body.gst.netCents + res.body.gst.taxCents).toBe(res.body.totalCents);
    // The total the user is asked to pay must not move because of tax.
    expect(res.body.totalCents).toBe(PRICE_CENTS);
  });

  it("reports no trial, per D3's build-to default", async () => {
    expect((await quote({})).body.trialAvailable).toBe(false);
  });

  it("applies a valid code and reduces the total", async () => {
    const code = `CHKOUT${uniqueSuffix().slice(-6).toUpperCase()}`;
    await prisma.coupon.create({
      data: { code, discountType: "percent", discountValue: 10, isActive: true },
    });

    const res = await quote({ code });
    expect(res.status).toBe(200);
    expect(res.body.couponCode).toBe(code);
    expect(res.body.discountCents).toBe(PRICE_CENTS * 0.1);
    expect(res.body.totalCents).toBe(PRICE_CENTS - PRICE_CENTS * 0.1);
    expect(res.body.couponError).toBeNull();
  });

  it("degrades on a bad code instead of failing the checkout", async () => {
    const res = await quote({ code: "NOSUCHCODE" });
    // The important part: still a 200 with a usable quote. Failing the
    // whole purchase over a typo is a worse outcome than full price.
    expect(res.status).toBe(200);
    expect(res.body.couponError).toBeTruthy();
    expect(res.body.totalCents).toBe(PRICE_CENTS);
    expect(res.body.couponCode).toBeNull();
  });

  it("writes nothing — an abandoned checkout leaves no payment row", async () => {
    const before = await prisma.payment.count({ where: { userId } });
    await quote({});
    await quote({ code: "NOSUCHCODE" });
    expect(await prisma.payment.count({ where: { userId } })).toBe(before);
  });

  it("refuses a plan that doesn't exist", async () => {
    const res = await request(app)
      .get("/checkout/quote")
      .query({ purpose: "subscription", referenceId: "no-such-plan" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("refuses to sell a programme separately while D2's default holds", async () => {
    const res = await request(app)
      .get("/checkout/quote")
      .query({ purpose: "program_purchase", referenceId: "anything" })
      .set("Authorization", `Bearer ${token}`);
    // D2: "Included in Premium; Admin price field kept for later."
    expect(res.status).toBe(409);
  });

  it("requires auth", async () => {
    expect((await request(app).get("/checkout/quote").query({ purpose: "subscription", referenceId: planId })).status).toBe(401);
  });

  describe("purchase history (U-M22)", () => {
    it("reports a refund's status on the purchase it belongs to", async () => {
      const payment = await prisma.payment.create({
        data: {
          userId,
          purpose: "subscription",
          referenceId: planId,
          amountCents: PRICE_CENTS,
          currency: "INR",
          providerOrderId: `order_hist_${uniqueSuffix()}`,
          status: "paid",
        },
      });
      await prisma.refund.create({
        data: { paymentId: payment.id, amountCents: PRICE_CENTS, status: "pending", reason: "Requested by the user" },
      });

      const res = await request(app).get("/checkout/purchases").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const row = res.body.find((p: { id: string }) => p.id === payment.id);
      expect(row.refund.status).toBe("pending");
      expect(row.refund.isPartial).toBe(false);
      // §10: the payment itself is untouched by the refund.
      expect(row.status).toBe("paid");
      // The admin's internal reason is staff-facing and must not leak.
      expect(JSON.stringify(row)).not.toContain("Requested by the user");
    });

    it("marks a partial refund as partial", async () => {
      const payment = await prisma.payment.create({
        data: {
          userId,
          purpose: "subscription",
          referenceId: planId,
          amountCents: PRICE_CENTS,
          currency: "INR",
          providerOrderId: `order_partial_${uniqueSuffix()}`,
          status: "paid",
        },
      });
      await prisma.refund.create({
        data: { paymentId: payment.id, amountCents: Math.round(PRICE_CENTS / 4), status: "processed" },
      });

      const res = await request(app).get("/checkout/purchases").set("Authorization", `Bearer ${token}`);
      const row = res.body.find((p: { id: string }) => p.id === payment.id);
      expect(row.refund.isPartial).toBe(true);
    });

    it("surfaces a captured payment whose entitlement never activated", async () => {
      const payment = await prisma.payment.create({
        data: {
          userId,
          purpose: "subscription",
          referenceId: planId,
          amountCents: PRICE_CENTS,
          currency: "INR",
          providerOrderId: `order_stuck_${uniqueSuffix()}`,
          status: "paid",
          activationFailedAt: new Date(),
        },
      });

      const res = await request(app).get("/checkout/purchases").set("Authorization", `Bearer ${token}`);
      const row = res.body.find((p: { id: string }) => p.id === payment.id);
      expect(row.activationFailed).toBe(true);
    });

    it("shows one user nothing of another user's purchases", async () => {
      const other = await request(app)
        .post("/auth/signup")
        .send({ email: uniqueEmail("checkout-other"), password: "Testpass123!", fullName: "Other" });
      const res = await request(app)
        .get("/checkout/purchases")
        .set("Authorization", `Bearer ${other.body.tokens.accessToken}`);
      expect(res.body).toEqual([]);
      await prisma.user.deleteMany({ where: { id: other.body.user.id } });
    });
  });

  describe("the GST split itself", () => {
    it("never loses or invents a paisa", () => {
      for (const total of [99900, 1, 333, 250000, 99999]) {
        const { netCents, taxCents } = splitGstInclusive(total, 18);
        expect(netCents + taxCents).toBe(total);
        expect(taxCents).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
