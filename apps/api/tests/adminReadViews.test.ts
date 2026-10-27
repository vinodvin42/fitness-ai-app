import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signAdminAccessToken } from "../src/lib/adminJwt";
import { generateUniqueReferralCode } from "../src/lib/referralCode";

/**
 * Admin read views added on 27 Oct 2026 (gap fixes, read-only):
 *  - GET /admin/users/:id/sessions          (users: view)
 *  - GET /admin/payments/:id → booking       (commerce: view)
 *  - GET /admin/professionals list/detail → languages + rating; GET /admin/professionals/:id/ratings
 *  - GET /admin/relationships/:id/chat-blocks (relationships: view)
 *  - GET /admin/coupons/:id/redemptions      (commerce: view)
 *
 * Fixtures are written straight to the DB (no signups, no logins), so no rate limits are touched.
 */
describe("Admin read views (27 Oct 2026)", () => {
  const app = buildApp();
  const suffix = uniqueSuffix();
  const day = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  const adminIds: string[] = [];
  const tokens: Record<"super" | "finance" | "support", string> = { super: "", finance: "", support: "" };
  let userId = "";
  let professionalId = "";
  let relationshipId = "";
  let couponId = "";
  let paymentId = "";
  let paidBookingId = "";
  let creditPaidBookingId = "";
  let proposedBookingId = "";
  let freeBookingId = "";
  let usedCreditId = "";
  let expiredCreditId = "";
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;
  const proposedTime = day(4);

  const as = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    for (const role of ["super_admin", "finance", "support"] as const) {
      const admin = await prisma.adminUser.create({
        data: { email: `read-views-${role}-${suffix}@example.com`, passwordHash: await hashPassword("unused"), fullName: `Read Views ${role}`, role, status: "active" },
      });
      adminIds.push(admin.id);
      const key = role === "super_admin" ? "super" : role;
      tokens[key] = signAdminAccessToken({ sub: admin.id, email: admin.email, role }).token;
    }

    const user = await prisma.user.create({
      data: { email: uniqueEmail("read-views-member"), passwordHash: await hashPassword("unused"), fullName: "Read Views Member", referralCode: await generateUniqueReferralCode() },
    });
    userId = user.id;
    const coach = await prisma.professional.create({
      data: {
        email: `read-views-coach-${suffix}@example.com`,
        passwordHash: await hashPassword("unused"),
        fullName: `Read Views Coach ${suffix}`,
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 10,
        languages: ["en", "hi"],
      },
    });
    professionalId = coach.id;
    pricing = await createPricedOffering(professionalId, { serviceType: "fitness", feeCents: 100000, label: "Read Views Session" });
    const offeringId = pricing.offering.id;
    relationshipId = (await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "active" } })).id;

    const payment = await prisma.payment.create({
      data: {
        userId,
        purpose: "booking",
        referenceId: offeringId,
        amountCents: 108000,
        currency: "INR",
        providerOrderId: `order_read_views_${suffix}`,
        status: "paid",
        feeCents: 100000,
        taxCents: 18000,
        couponCode: `RV${suffix}`.toUpperCase().slice(0, 20),
        discountCents: 10000,
      },
    });
    paymentId = payment.id;

    const base = { userId, professionalId, offeringId, durationMinutes: 60, priceCents: 100000, gstCents: 18000, commissionPct: 20 };
    // Paid by card, then cancelled by the member → a credit, later spent on another booking.
    paidBookingId = (
      await prisma.booking.create({
        data: { ...base, scheduledAt: day(-5), status: "cancelled", paymentId, cancelledAt: day(-6), cancelledBy: "member", cancelReason: "Clash at work" },
      })
    ).id;
    usedCreditId = (
      await prisma.sessionCredit.create({
        data: { userId, amountCents: 108000, reason: "member_cancelled", sourceBookingId: paidBookingId, expiresAt: day(60), usedAt: day(-4) },
      })
    ).id;
    creditPaidBookingId = (await prisma.booking.create({ data: { ...base, scheduledAt: day(-2), status: "confirmed", paidWithCreditId: usedCreditId } })).id;
    // Coach cancelled → credit that has since expired.
    const coachCancelled = await prisma.booking.create({
      data: { ...base, scheduledAt: day(-90), status: "cancelled", cancelledAt: day(-91), cancelledBy: "coach" },
    });
    expiredCreditId = (
      await prisma.sessionCredit.create({
        data: { userId, amountCents: 108000, reason: "reschedule_declined", sourceBookingId: coachCancelled.id, expiresAt: day(-1) },
      })
    ).id;
    // Upcoming, with a coach-proposed new time awaiting the member.
    proposedBookingId = (
      await prisma.booking.create({ data: { ...base, scheduledAt: day(3), status: "confirmed", proposedScheduledAt: proposedTime, proposedAt: day(-1) } })
    ).id;
    freeBookingId = (await prisma.booking.create({ data: { ...base, priceCents: 0, gstCents: 0, scheduledAt: day(-1), status: "confirmed" } })).id;

    await prisma.sessionRating.create({ data: { bookingId: creditPaidBookingId, userId, professionalId, stars: 4, tags: ["punctual"], comment: "Good" } });
    await prisma.sessionRating.create({ data: { bookingId: freeBookingId, userId, professionalId, stars: 5 } });

    await prisma.coachChatBlock.create({ data: { userId, professionalId, blockedBy: "user" } });

    const coupon = await prisma.coupon.create({
      data: { code: payment.couponCode as string, discountType: "fixed", discountValue: 10000, timesRedeemed: 1 },
    });
    couponId = coupon.id;
    await prisma.couponRedemption.create({ data: { couponId, userId, paymentId, discountCents: 10000 } });
  });

  afterAll(async () => {
    await prisma.coupon.deleteMany({ where: { id: couponId } });
    await prisma.booking.updateMany({ where: { userId }, data: { paidWithCreditId: null } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await pricing?.cleanup();
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  describe("GET /admin/users/:id/sessions", () => {
    it("needs auth and users: view (finance has no users module)", async () => {
      expect((await request(app).get(`/admin/users/${userId}/sessions`)).status).toBe(401);
      expect((await request(app).get(`/admin/users/${userId}/sessions`).set(as("finance"))).status).toBe(403);
      expect((await request(app).get(`/admin/users/${userId}/sessions`).set(as("support"))).status).toBe(200);
    });

    it("404s for an unknown user", async () => {
      const res = await request(app).get("/admin/users/00000000-0000-0000-0000-000000000000/sessions").set(as("super"));
      expect(res.status).toBe(404);
    });

    it("returns every booking with how it was paid, cancellation and proposal state, and every credit", async () => {
      const res = await request(app).get(`/admin/users/${userId}/sessions`).set(as("super"));
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(userId);
      expect(res.body.sessions).toHaveLength(5);
      // newest scheduled first
      const times = res.body.sessions.map((s: { scheduledAt: string }) => new Date(s.scheduledAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);

      const byId = Object.fromEntries(res.body.sessions.map((s: { bookingId: string }) => [s.bookingId, s]));
      const paid = byId[paidBookingId];
      expect(paid).toMatchObject({
        coachName: `Read Views Coach ${suffix}`,
        offeringLabel: "Read Views Session",
        status: "cancelled",
        cancelledBy: "member",
        cancelReason: "Clash at work",
        priceCents: 100000,
        gstCents: 18000,
        paidWith: "payment",
        paymentId,
        proposedScheduledAt: null,
      });
      expect(paid.cancelledAt).not.toBeNull();
      expect(paid.creditIssued).toMatchObject({ id: usedCreditId, amountCents: 108000, state: "used" });

      expect(byId[creditPaidBookingId]).toMatchObject({ paidWith: "credit", paidWithCreditId: usedCreditId, paymentId: null, creditIssued: null });
      expect(byId[freeBookingId].paidWith).toBe("free");
      expect(byId[proposedBookingId].status).toBe("confirmed");
      expect(new Date(byId[proposedBookingId].proposedScheduledAt).getTime()).toBe(proposedTime.getTime());

      expect(res.body.credits).toHaveLength(2);
      const credits = Object.fromEntries(res.body.credits.map((c: { id: string }) => [c.id, c]));
      expect(credits[usedCreditId]).toMatchObject({
        state: "used",
        reason: "member_cancelled",
        sourceBooking: { bookingId: paidBookingId, coachName: `Read Views Coach ${suffix}`, offeringLabel: "Read Views Session" },
        usedBooking: { bookingId: creditPaidBookingId },
      });
      expect(credits[usedCreditId].usedAt).not.toBeNull();
      expect(credits[expiredCreditId]).toMatchObject({ state: "expired", usedAt: null, usedBooking: null });
    });
  });

  describe("GET /admin/payments/:id → booking", () => {
    it("shows the booking this payment bought, with its cancelled/credited state", async () => {
      const res = await request(app).get(`/admin/payments/${paymentId}`).set(as("super"));
      expect(res.status).toBe(200);
      expect(res.body.booking).toMatchObject({
        bookingId: paidBookingId,
        userId,
        professionalId,
        status: "cancelled",
        cancelledBy: "member",
        credit: { id: usedCreditId, state: "used" },
      });
    });
  });

  describe("Professionals: languages, rating and the ratings list", () => {
    it("directory rows carry languages and the rating average; only region is still missing", async () => {
      const res = await request(app).get("/admin/professionals").query({ search: `Read Views Coach ${suffix}` }).set(as("super"));
      expect(res.status).toBe(200);
      expect(res.body.notAvailable).toEqual(["region"]);
      const row = res.body.professionals.find((p: { id: string }) => p.id === professionalId);
      expect(row.languages).toEqual(["en", "hi"]);
      expect(row.rating).toEqual({ average: 4.5, count: 2 });
    });

    it("the profile carries the rating summary and no reviews gap", async () => {
      const res = await request(app).get(`/admin/professionals/${professionalId}`).set(as("super"));
      expect(res.status).toBe(200);
      expect(res.body.rating).toEqual({ average: 4.5, count: 2 });
      expect(res.body.professional.languages).toEqual(["en", "hi"]);
      expect(res.body.notAvailable).toEqual([]);
    });

    it("lists the ratings (professionals: view; support has none)", async () => {
      expect((await request(app).get(`/admin/professionals/${professionalId}/ratings`)).status).toBe(401);
      expect((await request(app).get(`/admin/professionals/${professionalId}/ratings`).set(as("support"))).status).toBe(403);
      const res = await request(app).get(`/admin/professionals/${professionalId}/ratings`).set(as("super"));
      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual({ average: 4.5, count: 2 });
      expect(res.body.ratings).toHaveLength(2);
      const four = res.body.ratings.find((r: { stars: number }) => r.stars === 4);
      expect(four).toMatchObject({ bookingId: creditPaidBookingId, userId, userFullName: "Read Views Member", tags: ["punctual"], comment: "Good", offeringLabel: "Read Views Session" });
      expect((await request(app).get("/admin/professionals/00000000-0000-0000-0000-000000000000/ratings").set(as("super"))).status).toBe(404);
    });
  });

  describe("GET /admin/relationships/:id/chat-blocks", () => {
    it("returns the pair's blocks (relationships: view)", async () => {
      expect((await request(app).get(`/admin/relationships/${relationshipId}/chat-blocks`).set(as("support"))).status).toBe(403);
      const res = await request(app).get(`/admin/relationships/${relationshipId}/chat-blocks`).set(as("super"));
      expect(res.status).toBe(200);
      expect(res.body.relationshipId).toBe(relationshipId);
      expect(res.body.blocks).toHaveLength(1);
      expect(res.body.blocks[0].blockedBy).toBe("user");
    });
  });

  describe("GET /admin/coupons/:id/redemptions", () => {
    it("lists who redeemed it with the payment (commerce: view)", async () => {
      expect((await request(app).get(`/admin/coupons/${couponId}/redemptions`).set(as("support"))).status).toBe(403);
      const res = await request(app).get(`/admin/coupons/${couponId}/redemptions`).set(as("finance"));
      expect(res.status).toBe(200);
      expect(res.body.coupon.id).toBe(couponId);
      expect(res.body.redemptions).toHaveLength(1);
      expect(res.body.redemptions[0]).toMatchObject({
        userId,
        userFullName: "Read Views Member",
        discountCents: 10000,
        paymentId,
        payment: { id: paymentId, purpose: "booking", amountCents: 108000, status: "paid" },
      });
      expect((await request(app).get("/admin/coupons/00000000-0000-0000-0000-000000000000/redemptions").set(as("super"))).status).toBe(404);
    });
  });
});
