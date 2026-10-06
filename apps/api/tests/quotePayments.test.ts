import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { env } from "../src/config/env";

// Razorpay's network call is mocked: it echoes back the amount it was asked
// to charge so the tests can assert exactly what createOrder() sent.
const orderCreate = vi.hoisted(() =>
  vi.fn(async (args: { amount: number }) => ({
    id: `order_quote_${Math.random().toString(36).slice(2)}`,
    amount: args.amount,
  })),
);
vi.mock("../src/lib/razorpayClient", () => ({
  isRazorpayConfigured: () => true,
  getRazorpayClient: () => ({ orders: { create: orderCreate } }),
}));

import { createOrder, verifyPayment, QUOTE_PAYMENT_WINDOW_MS } from "../src/modules/payments/payments.service";

/**
 * Accepted coach quotes are charged at the quoted price: createOrder (purpose
 * "booking") with `quoteRequestId` reads the price from the quote server-side.
 */
describe("Quote-priced booking orders", () => {
  let userId: string;
  let otherUserId: string;
  let proId: string;
  let otherProId: string;
  let offeringId: string;
  let otherProOfferingId: string;
  const keySecret = "quote-test-secret";
  let prevKeyId: string | undefined;
  let prevSecret: string | undefined;

  const mkUser = async (label: string) =>
    (
      await prisma.user.create({
        data: {
          email: uniqueEmail(label),
          passwordHash: await hashPassword("unused"),
          fullName: `Quote ${label}`,
          referralCode: await generateUniqueReferralCode(),
        },
      })
    ).id;
  const mkPro = async (label: string) =>
    (
      await prisma.professional.create({
        data: { email: `${label}-${uniqueSuffix()}@example.com`, passwordHash: await hashPassword("unused"), fullName: label, status: "active" },
      })
    ).id;

  const slot = (hour: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 2);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const mkQuote = (over: Record<string, unknown> = {}) =>
    prisma.quoteRequest.create({
      data: {
        userId,
        professionalId: proId,
        serviceType: "fitness",
        message: "hi",
        status: "accepted",
        quotedPriceCents: 55000,
        currency: env.RAZORPAY_CURRENCY,
        quoteExpiresAt: new Date(Date.now() + 86400000),
        acceptedAt: new Date(),
        ...over,
      },
    });

  beforeAll(async () => {
    prevKeyId = env.RAZORPAY_KEY_ID;
    prevSecret = env.RAZORPAY_KEY_SECRET;
    env.RAZORPAY_KEY_ID = "rzp_test_quote";
    env.RAZORPAY_KEY_SECRET = keySecret;
    userId = await mkUser("quote-user");
    otherUserId = await mkUser("quote-other-user");
    proId = await mkPro("Quote Coach");
    otherProId = await mkPro("Other Quote Coach");
    offeringId = (
      await prisma.professionalServiceOffering.create({
        data: { professionalId: proId, serviceType: "fitness", label: "Session", durationMinutes: 60, priceCents: 90000, isActive: true },
      })
    ).id;
    otherProOfferingId = (
      await prisma.professionalServiceOffering.create({
        data: { professionalId: otherProId, serviceType: "fitness", label: "Session", durationMinutes: 60, priceCents: 90000, isActive: true },
      })
    ).id;
    for (const pid of [proId, otherProId]) {
      await prisma.relationship.create({ data: { userId, professionalId: pid, serviceType: "fitness", status: "accepted" } });
    }
  });

  afterEach(async () => {
    orderCreate.mockClear();
    await prisma.booking.deleteMany({ where: { userId } });
    await prisma.payment.deleteMany({ where: { userId } });
    await prisma.quoteRequest.deleteMany({ where: { userId } });
    await prisma.relationship.updateMany({ where: { userId }, data: { status: "accepted" } });
  });

  afterAll(async () => {
    env.RAZORPAY_KEY_ID = prevKeyId;
    env.RAZORPAY_KEY_SECRET = prevSecret;
    await prisma.relationship.deleteMany({ where: { userId } });
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId: { in: [proId, otherProId] } } });
    await prisma.professional.deleteMany({ where: { id: { in: [proId, otherProId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it("charges the quoted price (not the offering price) and links the payment to the quote", async () => {
    const q = await mkQuote();
    const res = await createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: slot(9), quoteRequestId: q.id });
    expect(res.amountCents).toBe(55000);
    expect(orderCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 55000 }));
    const payment = await prisma.payment.findFirst({ where: { providerOrderId: res.orderId } });
    expect(payment?.amountCents).toBe(55000);
    expect(payment?.quoteRequestId).toBe(q.id);
  });

  it("without a quote still charges the offering price", async () => {
    const res = await createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: slot(10) });
    expect(res.amountCents).toBe(90000);
  });

  it("ignores a client-supplied amount (extra fields never reach the order)", async () => {
    const q = await mkQuote();
    const input = { purpose: "booking", referenceId: offeringId, scheduledAt: slot(11), quoteRequestId: q.id, amountCents: 1, amount: 1 } as never;
    const res = await createOrder(userId, input);
    expect(res.amountCents).toBe(55000);
    expect(orderCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 55000 }));
  });

  it("rejects another user's quote", async () => {
    const q = await mkQuote();
    await expect(
      createOrder(otherUserId, { purpose: "booking", referenceId: offeringId, scheduledAt: slot(9), quoteRequestId: q.id }),
    ).rejects.toMatchObject({ status: 404, code: "quote_request_not_found" });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("rejects a quote from a different professional", async () => {
    const q = await mkQuote();
    await expect(
      createOrder(userId, { purpose: "booking", referenceId: otherProOfferingId, scheduledAt: slot(9), quoteRequestId: q.id }),
    ).rejects.toMatchObject({ status: 422, code: "quote_offering_mismatch" });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("rejects non-accepted and stale-accepted quotes", async () => {
    const quoted = await mkQuote({ status: "quoted", acceptedAt: null });
    await expect(
      createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: slot(9), quoteRequestId: quoted.id }),
    ).rejects.toMatchObject({ code: "quote_not_accepted" });
    const stale = await mkQuote({ acceptedAt: new Date(Date.now() - QUOTE_PAYMENT_WINDOW_MS - 1000) });
    await expect(
      createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: slot(9), quoteRequestId: stale.id }),
    ).rejects.toMatchObject({ code: "quote_payment_window_expired" });
  });

  it("rejects an already-consumed quote, and consumes it when the payment activates the booking", async () => {
    const q = await mkQuote();
    const res = await createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: slot(9), quoteRequestId: q.id });
    const payId = "pay_quote_test";
    const sig = crypto.createHmac("sha256", keySecret).update(`${res.orderId}|${payId}`).digest("hex");
    const verified = await verifyPayment(userId, { razorpayOrderId: res.orderId, razorpayPaymentId: payId, razorpaySignature: sig });
    expect(verified.verified).toBe(true);
    expect((await prisma.quoteRequest.findUnique({ where: { id: q.id } }))?.status).toBe("consumed");

    await expect(
      createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: slot(12), quoteRequestId: q.id }),
    ).rejects.toMatchObject({ status: 409, code: "quote_already_used" });
  });

  it("rejects a quote that already has a captured payment even if its status is still accepted", async () => {
    const q = await mkQuote();
    await prisma.payment.create({
      data: { userId, purpose: "booking", referenceId: offeringId, amountCents: 55000, providerOrderId: `order_paid_${uniqueSuffix()}`, status: "paid", quoteRequestId: q.id },
    });
    await expect(
      createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: slot(9), quoteRequestId: q.id }),
    ).rejects.toMatchObject({ code: "quote_already_used" });
  });

  it("two paid orders on one quote: exactly one booking, the other is parked for refund; re-verify of the winner stays idempotent", async () => {
    const q = await mkQuote();
    const a = await createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: slot(9), quoteRequestId: q.id });
    const b = await createOrder(userId, { purpose: "booking", referenceId: offeringId, scheduledAt: slot(13), quoteRequestId: q.id });
    const verify = (orderId: string, payId: string) =>
      verifyPayment(userId, {
        razorpayOrderId: orderId,
        razorpayPaymentId: payId,
        razorpaySignature: crypto.createHmac("sha256", keySecret).update(`${orderId}|${payId}`).digest("hex"),
      });
    const results = await Promise.allSettled([verify(a.orderId, "pay_a"), verify(b.orderId, "pay_b")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "quote_already_used" });
    expect(await prisma.booking.count({ where: { userId } })).toBe(1);

    const quote = await prisma.quoteRequest.findUnique({ where: { id: q.id } });
    expect(quote?.status).toBe("consumed");
    const loser = await prisma.payment.findFirst({ where: { quoteRequestId: q.id, id: { not: quote!.consumedPaymentId! } } });
    const items = await prisma.adminActionItem.findMany({ where: { entityType: "Payment", entityId: loser!.id, status: "open" } });
    expect(items).toHaveLength(1);

    // Same payment re-activating still passes the claim check (idempotent fast path).
    const again = await verify(quote!.consumedPaymentId === (await prisma.payment.findFirst({ where: { providerOrderId: a.orderId } }))!.id ? a.orderId : b.orderId, "pay_again");
    expect(again.verified).toBe(true);
    await prisma.adminActionItem.deleteMany({ where: { entityType: "Payment", entityId: loser!.id } });
  });
});
