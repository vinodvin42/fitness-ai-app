import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";

/**
 * coupons.service.ts's validateCoupon() — POST /coupons/validate always
 * responds 200 (it is a preview endpoint, not a mutation), with a
 * discriminated `{ valid: true, ... }` / `{ valid: false, reason }` body.
 * Every Coupon fixture below is created directly via Prisma with a unique
 * code, rather than depending on any admin-created coupon already existing
 * in this database.
 */
describe("Coupons: validateCoupon", () => {
  const app = buildApp();
  let userId: string;
  let userEmail: string;
  let accessToken: string;
  const couponIds: string[] = [];

  beforeAll(async () => {
    userEmail = uniqueEmail("coupons");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: userEmail, password: "SomePassword1!", fullName: "Coupons Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.coupon.deleteMany({ where: { id: { in: couponIds } } }); // cascades each coupon's own redemptions
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  function validate(code: string, amountCents: number) {
    return request(app)
      .post("/coupons/validate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code, amountCents });
  }

  it("succeeds with correct discount math for a valid, unexpired, unused percent coupon", async () => {
    const code = `PCT20-${uniqueSuffix()}`.toUpperCase();
    const coupon = await prisma.coupon.create({
      data: { code, discountType: "percent", discountValue: 20, isActive: true },
    });
    couponIds.push(coupon.id);

    const res = await validate(code, 10_000);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.code).toBe(code);
    expect(res.body.discountCents).toBe(2_000); // floor(10000 * 20 / 100)
    expect(res.body.finalCents).toBe(8_000);
  });

  it("succeeds with correct discount math for a valid fixed-amount coupon", async () => {
    const code = `FIXED500-${uniqueSuffix()}`.toUpperCase();
    const coupon = await prisma.coupon.create({
      data: { code, discountType: "fixed", discountValue: 500, isActive: true },
    });
    couponIds.push(coupon.id);

    const res = await validate(code, 10_000);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.discountCents).toBe(500);
    expect(res.body.finalCents).toBe(9_500);
  });

  it("fails for an expired code", async () => {
    const code = `EXPIRED-${uniqueSuffix()}`.toUpperCase();
    const coupon = await prisma.coupon.create({
      data: {
        code,
        discountType: "percent",
        discountValue: 10,
        isActive: true,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    couponIds.push(coupon.id);

    const res = await validate(code, 10_000);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toMatch(/expired/i);
  });

  it("fails once a code's usage limit is exhausted", async () => {
    const code = `MAXEDOUT-${uniqueSuffix()}`.toUpperCase();
    const coupon = await prisma.coupon.create({
      data: { code, discountType: "percent", discountValue: 10, isActive: true, maxRedemptions: 1, timesRedeemed: 1 },
    });
    couponIds.push(coupon.id);

    const res = await validate(code, 10_000);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toMatch(/fully redeemed/i);
  });

  it("fails for a code that doesn't exist", async () => {
    const res = await validate(`NOPE-${uniqueSuffix()}`.toUpperCase(), 10_000);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toMatch(/isn't valid/i);
  });

  it("fails if this user has already redeemed the code", async () => {
    const code = `ALREADYUSED-${uniqueSuffix()}`.toUpperCase();
    const coupon = await prisma.coupon.create({
      data: { code, discountType: "percent", discountValue: 10, isActive: true },
    });
    couponIds.push(coupon.id);
    await prisma.couponRedemption.create({
      data: { couponId: coupon.id, userId, discountCents: 100 },
    });

    const res = await validate(code, 10_000);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toMatch(/already used/i);
  });
});
