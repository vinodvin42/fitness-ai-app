import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Owner decision (20 Oct 2026): plans, prices and discounts belong to the
 * super admin portal, and the app shows whatever is set there. End to end
 * over HTTP: the super admin creates a plan, prices it, archives it and
 * creates a discount code; a member sees exactly the active plans and their
 * prices, and the code discounts their checkout quote.
 *
 * Rate limits: 1 admin login + 1 consumer signup.
 */
describe("Super admin owns plans, prices and discounts", () => {
  const app = buildApp();
  const password = "OwnerPlansPass9!";
  const suffix = uniqueSuffix().replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase();
  const planIds: string[] = [];
  let adminId: string;
  let adminToken: string;
  let userId: string;
  let userToken: string;
  let couponId: string | undefined;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const asMember = () => ({ Authorization: `Bearer ${userToken}` });
  const offered = async () => {
    const res = await request(app).get("/subscription-plans").set(asMember());
    expect(res.status).toBe(200);
    return res.body.items as Array<{ id: string; name: string; priceCents: number }>;
  };
  const createPlan = async (billingCycle: "monthly" | "quarterly", priceCents: number) => {
    const res = await request(app)
      .post("/admin/plans")
      .set(asAdmin())
      .send({ name: `Prime ${suffix} ${billingCycle}`, tier: "prime", billingCycle, priceCents });
    expect(res.status).toBe(201);
    planIds.push(res.body.plan.id);
    return res.body.plan as { id: string; priceCents: number };
  };

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { email: uniqueEmail("owner-plans"), passwordHash: await hashPassword(password), fullName: "Owner Plans", role: "super_admin", status: "active" },
    });
    adminId = admin.id;
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password });
    expect(login.status).toBe(200);
    adminToken = login.body.token;
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("owner-plans-member"), password: "SomePassword1!", fullName: "Plans Member" });
    userId = signup.body.user.id;
    userToken = signup.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (couponId) await prisma.coupon.deleteMany({ where: { id: couponId } });
    await prisma.planPriceChange.deleteMany({ where: { planId: { in: planIds } } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("a plan the super admin creates is offered to members at its price", async () => {
    const plan = await createPlan("quarterly", 79900);
    expect((await offered()).find((p) => p.id === plan.id)).toEqual(expect.objectContaining({ priceCents: 79900 }));
  });

  it("its price can be changed directly while nobody has bought it, and members see the new price", async () => {
    const res = await request(app).patch(`/admin/plans/${planIds[0]}`).set(asAdmin()).send({ priceCents: 29900 });
    expect(res.status).toBe(200);
    expect((await offered()).find((p) => p.id === planIds[0])?.priceCents).toBe(29900);
  });

  it("archiving a plan stops offering it", async () => {
    const res = await request(app).post(`/admin/plans/${planIds[0]}/archive`).set(asAdmin());
    expect(res.status).toBe(200);
    expect((await offered()).some((p) => p.id === planIds[0])).toBe(false);
  });

  it("a discount code the super admin creates applies to the member's checkout", async () => {
    const plan = await createPlan("monthly", 29900);
    const code = `LAUNCH${suffix}`;
    const created = await request(app)
      .post("/admin/coupons")
      .set(asAdmin())
      .send({ code, discountType: "percent", discountValue: 10, description: "Launch discount" });
    expect(created.status).toBe(201);
    couponId = created.body.coupon.id;

    const quote = await request(app)
      .get("/checkout/quote")
      .query({ purpose: "subscription", referenceId: plan.id, code })
      .set(asMember());
    expect(quote.status).toBe(200);
    expect(quote.body).toEqual(expect.objectContaining({ listPriceCents: 29900, discountCents: 2990, totalCents: 26910, couponCode: code }));
  });
});
