import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { env } from "../src/config/env";
import { verifyPayment } from "../src/modules/payments/payments.service";

/**
 * Coach levels, fees and FynroX commission (blueprint 4.3, Package 4),
 * end to end against real Postgres:
 *
 * - A coach with no level can't be booked.
 * - The Super Admin creates a level, a service and a fee, and places the
 *   coach; the coach's offering appears with fee + GST.
 * - A future fee doesn't change today's price and can be cancelled; a past
 *   start date is refused.
 * - A paid booking copies the fee, GST and commission; later fee and
 *   commission changes never touch it or its settlement.
 * - Finance's fee change becomes an approval request (maker-checker).
 * - The coach can read their level and fees, and has no way to change them.
 *
 * Never changes FynroX's default commission (shared test database).
 * Rate limits: admin login (authRateLimit) is used twice.
 */
describe("Coach levels, fees and commission (Package 4)", () => {
  const app = buildApp();
  const password = "CoachLevelsPass9!";
  const adminIds: string[] = [];
  let superToken: string;
  let financeToken: string;
  let userId: string;
  let userToken: string;
  let professionalId: string;
  let professionalToken: string;
  let levelId: string;
  let serviceId: string;
  let offeringId: string;
  let gstPercent: number;
  let previousKeyId: string | undefined;
  let previousKeySecret: string | undefined;

  async function createAdmin(role: string) {
    const admin = await prisma.adminUser.create({
      data: { email: uniqueEmail(`cl-${role}`), passwordHash: await hashPassword(password), fullName: `CL ${role}`, role: role as never, status: "active" },
    });
    adminIds.push(admin.id);
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password });
    expect(login.status).toBe(200);
    return login.body.token as string;
  }

  function tomorrowAt(hourUtc: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
  }

  function indiaDateInDays(days: number): string {
    return new Date(Date.now() + days * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    previousKeyId = env.RAZORPAY_KEY_ID;
    previousKeySecret = env.RAZORPAY_KEY_SECRET;
    env.RAZORPAY_KEY_ID = "rzp_test_coach_levels_fixture";
    env.RAZORPAY_KEY_SECRET = "coach-levels-test-key-secret";

    superToken = await createAdmin("super_admin");
    financeToken = await createAdmin("finance");

    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("coach-levels-user"), password: "SomePassword1!", fullName: "Level Tester" });
    userId = signup.body.user.id;
    userToken = signup.body.tokens.accessToken;

    const professional = await prisma.professional.create({
      data: {
        email: `coach-levels-${uniqueSuffix()}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Level Fixture Coach",
        status: "active",
        credentials: { create: { serviceType: "fitness", status: "verified" } },
      },
    });
    professionalId = professional.id;
    professionalToken = signProfessionalAccessToken({ sub: professionalId, email: professional.email }).token;
  });

  afterAll(async () => {
    env.RAZORPAY_KEY_ID = previousKeyId;
    env.RAZORPAY_KEY_SECRET = previousKeySecret;
    await prisma.approvalRequest.deleteMany({ where: { makerAdminId: { in: adminIds } } });
    await prisma.auditLog.deleteMany({ where: { actorAdminId: { in: adminIds } } });
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.booking.deleteMany({ where: { professionalId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    // createService gives every placed coach an offering for the new
    // service (seeded demo coaches too), so clear those before the service.
    if (serviceId) await prisma.professionalServiceOffering.deleteMany({ where: { serviceId } });
    if (serviceId) await prisma.coachService.deleteMany({ where: { id: serviceId } });
    if (levelId) await prisma.coachLevel.deleteMany({ where: { id: levelId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  it("can't book a coach who hasn't been placed in a level", async () => {
    const detail = await request(app).get(`/coaching/professionals/${professionalId}`).set("Authorization", `Bearer ${userToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.level).toBeNull();
    expect(detail.body.offerings).toEqual([]);
  });

  it("lets the Super Admin create a level, a service and a fee, and place the coach", async () => {
    const level = await request(app)
      .post("/admin/coach-levels")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ name: `Test Level ${uniqueSuffix()}`, description: "Fixture level" });
    expect(level.status).toBe(201);
    levelId = level.body.level.id;

    const service = await request(app)
      .post("/admin/coach-services")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ label: `Strength review ${uniqueSuffix()}`, serviceType: "fitness", durationMinutes: 45 });
    expect(service.status).toBe(201);
    serviceId = service.body.service.id;

    const fee = await request(app)
      .post(`/admin/coach-levels/${levelId}/fees`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ serviceId, priceCents: 150000, reason: "Starting fee for this level" });
    expect(fee.status).toBe(201);

    const placed = await request(app)
      .put(`/admin/professionals/${professionalId}/coach-level`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ coachLevelId: levelId, reason: "Verified coach, entry level" });
    expect(placed.status).toBe(200);

    const offering = await prisma.professionalServiceOffering.findFirst({ where: { professionalId, serviceId } });
    expect(offering).not.toBeNull();
    offeringId = offering!.id;

    const detail = await request(app).get(`/coaching/professionals/${professionalId}`).set("Authorization", `Bearer ${userToken}`);
    expect(detail.status).toBe(200);
    gstPercent = detail.body.gstPercent;
    const gst = Math.round((150000 * gstPercent) / 100);
    expect(detail.body.level.name).toContain("Test Level");
    const o = detail.body.offerings.find((x: { id: string }) => x.id === offeringId);
    expect(o).toMatchObject({ priceCents: 150000, gstCents: gst, totalCents: 150000 + gst });
  });

  it("keeps today's price until a scheduled fee starts, lets it be cancelled, and refuses a past start", async () => {
    const future = await request(app)
      .post(`/admin/coach-levels/${levelId}/fees`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ serviceId, priceCents: 180000, effectiveFrom: indiaDateInDays(10), reason: "Planned raise for this level" });
    expect(future.status).toBe(201);

    const detail = await request(app).get(`/coaching/professionals/${professionalId}`).set("Authorization", `Bearer ${userToken}`);
    expect(detail.body.offerings.find((x: { id: string }) => x.id === offeringId).priceCents).toBe(150000);

    const admin = await request(app).get("/admin/coach-levels").set("Authorization", `Bearer ${superToken}`);
    const cell = admin.body.levels
      .find((l: { id: string }) => l.id === levelId)
      .fees.find((f: { serviceId: string }) => f.serviceId === serviceId);
    expect(cell.priceCents).toBe(150000);
    expect(cell.scheduled).toHaveLength(1);

    const cancelled = await request(app)
      .post(`/admin/coach-fees/${future.body.fee.id}/cancel`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({});
    expect(cancelled.status).toBe(200);

    const past = await request(app)
      .post(`/admin/coach-levels/${levelId}/fees`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ serviceId, priceCents: 90000, effectiveFrom: indiaDateInDays(-5), reason: "Backdated change attempt" });
    expect(past.status).toBe(422);
    expect(past.body.error.code).toBe("start_in_past");
  });

  it("turns Finance's fee change into an approval request and changes nothing", async () => {
    const res = await request(app)
      .post(`/admin/coach-levels/${levelId}/fees`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ serviceId, priceCents: 99900, reason: "Finance proposes a lower fee" });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("pending_approval");

    const detail = await request(app).get(`/coaching/professionals/${professionalId}`).set("Authorization", `Bearer ${userToken}`);
    expect(detail.body.offerings.find((x: { id: string }) => x.id === offeringId).priceCents).toBe(150000);
  });

  it("copies fee, GST and commission onto a paid booking; later changes never touch it or its settlement", async () => {
    const rate = await request(app)
      .post(`/admin/professionals/${professionalId}/commission`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ pct: 25, reason: "Own rate for this coach" });
    expect(rate.status).toBe(201);

    await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "accepted" } });
    const gst = Math.round((150000 * gstPercent) / 100);
    const providerOrderId = `order_levels_${uniqueSuffix()}`;
    await prisma.payment.create({
      data: {
        userId,
        purpose: "booking",
        referenceId: offeringId,
        amountCents: 150000 + gst,
        feeCents: 150000,
        taxCents: gst,
        currency: "INR",
        providerOrderId,
        status: "created",
        scheduledAt: new Date(tomorrowAt(10)),
      },
    });
    const razorpayPaymentId = `pay_levels_${uniqueSuffix()}`;
    const razorpaySignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
      .update(`${providerOrderId}|${razorpayPaymentId}`)
      .digest("hex");
    const verified = await verifyPayment(userId, { razorpayOrderId: providerOrderId, razorpayPaymentId, razorpaySignature });
    expect(verified.booking).toBeDefined();

    const booking = await prisma.booking.findFirstOrThrow({ where: { userId, professionalId } });
    expect(booking).toMatchObject({ priceCents: 150000, gstCents: gst, commissionPct: 25, coachLevelId: levelId });

    // Later changes: a new fee and a new commission, both from now.
    await request(app)
      .post(`/admin/coach-levels/${levelId}/fees`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ serviceId, priceCents: 200000, reason: "New fee for this level" })
      .expect(201);
    await request(app)
      .post(`/admin/professionals/${professionalId}/commission`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ pct: 30, reason: "Rate changes for new bookings" })
      .expect(201);

    const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchanged).toMatchObject({ priceCents: 150000, gstCents: gst, commissionPct: 25 });

    // Settle-able view: move the session into the past and read the month.
    const delivered = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.booking.update({ where: { id: booking.id }, data: { scheduledAt: delivered } });
    const month = `${delivered.getUTCFullYear()}-${String(delivered.getUTCMonth() + 1).padStart(2, "0")}`;
    const settlements = await request(app)
      .get("/admin/settlements")
      .query({ month })
      .set("Authorization", `Bearer ${superToken}`);
    expect(settlements.status).toBe(200);
    const row = settlements.body.rows.find((r: { professionalId: string }) => r.professionalId === professionalId);
    expect(row).toMatchObject({
      grossCents: 150000,
      commissionCents: 37500,
      netCents: 112500,
      commissionPct: 25,
      currentCommissionPct: 30,
    });
  });

  it("shows the coach their level, fees and commission, with no way to change them", async () => {
    const res = await request(app).get("/professionals/me/level").set("Authorization", `Bearer ${professionalToken}`);
    expect(res.status).toBe(200);
    expect(res.body.level.name).toContain("Test Level");
    expect(res.body.commissionPct).toBe(30);
    const fee = res.body.fees.find((f: { label: string }) => f.label.startsWith("Strength review"));
    expect(fee.priceCents).toBe(200000);

    const attempt = await request(app)
      .put("/professionals/me/level")
      .set("Authorization", `Bearer ${professionalToken}`)
      .send({ coachLevelId: null });
    expect(attempt.status).toBe(404);
  });

  it("puts the coach back on FynroX's default rate with a null override", async () => {
    const res = await request(app)
      .post(`/admin/professionals/${professionalId}/commission`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ pct: null, reason: "Back to the default rate" });
    expect(res.status).toBe(201);
    const admin = await request(app).get("/admin/coach-levels").set("Authorization", `Bearer ${superToken}`);
    const coach = admin.body.coaches.find((c: { id: string }) => c.id === professionalId);
    expect(coach.commissionPct).toBe(admin.body.commission.defaultPct);
    expect(coach.hasCommissionOverride).toBe(false);
  });
});
