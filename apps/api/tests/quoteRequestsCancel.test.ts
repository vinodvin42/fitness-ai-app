import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import {
  acceptQuote,
  cancelQuoteRequest,
  createQuoteRequest,
  declineQuote,
  getMyQuoteRequest,
  sendQuote,
} from "../src/modules/quoteRequests/quoteRequests.service";
import { createQuoteRequestSchema } from "../src/modules/quoteRequests/quoteRequests.schema";

/** Cancel-a-pending-request + preferredAt on create (Professional Guidance 05/02). */
describe("Quote request cancel + preferred time", () => {
  let userId: string;
  let otherUserId: string;
  let proId: string;

  const mkUser = async (label: string) =>
    (
      await prisma.user.create({
        data: {
          email: uniqueEmail(label),
          passwordHash: await hashPassword("unused"),
          fullName: `Cancel ${label}`,
          referralCode: await generateUniqueReferralCode(),
        },
      })
    ).id;

  beforeAll(async () => {
    userId = await mkUser("owner");
    otherUserId = await mkUser("other");
    proId = (
      await prisma.professional.create({
        data: { email: `cancel-${uniqueSuffix()}@example.com`, passwordHash: await hashPassword("unused"), fullName: "Cancel Pro", status: "active" },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.quoteRequest.deleteMany({ where: { professionalId: proId } });
    await prisma.professional.delete({ where: { id: proId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  });

  it("stores and returns preferredAt, and rejects a past one", async () => {
    const when = new Date(Date.now() + 3 * 86400000).toISOString();
    const q = await createQuoteRequest(userId, { professionalId: proId, serviceType: "fitness", message: "Single session", preferredAt: when });
    expect(q.preferredAt).toBe(when);
    await cancelQuoteRequest(userId, q.id);
    await expect(
      createQuoteRequest(userId, { professionalId: proId, serviceType: "fitness", message: "x", preferredAt: new Date(Date.now() - 1000).toISOString() }),
    ).rejects.toMatchObject({ status: 400 });
    expect(createQuoteRequestSchema.safeParse({ professionalId: "p", serviceType: "fitness", message: "m", preferredAt: "nope" }).success).toBe(false);
  });

  it("cancels a pending request (idempotent), frees the slot, and blocks other users", async () => {
    const q = await createQuoteRequest(userId, { professionalId: proId, serviceType: "nutrition", message: "Plan please" });
    expect(q.preferredAt).toBeNull();
    await expect(cancelQuoteRequest(otherUserId, q.id)).rejects.toMatchObject({ status: 404 });
    const c = await cancelQuoteRequest(userId, q.id);
    expect(c.status).toBe("cancelled");
    expect((await cancelQuoteRequest(userId, q.id)).status).toBe("cancelled");
    expect((await getMyQuoteRequest(userId, q.id)).status).toBe("cancelled");
    // No longer open, so a new request for the same coach/service is allowed.
    const again = await createQuoteRequest(userId, { professionalId: proId, serviceType: "nutrition", message: "Plan please again" });
    expect(again.status).toBe("pending");
    // The coach can no longer quote a cancelled request.
    await expect(
      sendQuote(proId, q.id, { priceCents: 1000, currency: "INR", expiresAt: new Date(Date.now() + 86400000).toISOString() }),
    ).rejects.toMatchObject({ status: 409 });
    await cancelQuoteRequest(userId, again.id);
  });

  it("lets the user decline a received quote, but not once accepted, declined or answered", async () => {
    const decl = await createQuoteRequest(userId, { professionalId: proId, serviceType: "combined", message: "Both please" });
    await sendQuote(proId, decl.id, { priceCents: 5000, currency: "INR", expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect((await cancelQuoteRequest(userId, decl.id)).status).toBe("cancelled");

    const q = await createQuoteRequest(userId, { professionalId: proId, serviceType: "combined", message: "Both please again" });
    await sendQuote(proId, q.id, { priceCents: 5000, currency: "INR", expiresAt: new Date(Date.now() + 86400000).toISOString() });
    await acceptQuote(userId, q.id);
    await expect(cancelQuoteRequest(userId, q.id)).rejects.toMatchObject({ status: 409 });

    const d = await createQuoteRequest(userId, { professionalId: proId, serviceType: "fitness", message: "Decline me" });
    await declineQuote(proId, d.id, { reason: "Busy" });
    await expect(cancelQuoteRequest(userId, d.id)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to cancel an expired quote", async () => {
    const q = await createQuoteRequest(userId, { professionalId: proId, serviceType: "nutrition", message: "Expire me" });
    await sendQuote(proId, q.id, { priceCents: 100, currency: "INR", expiresAt: new Date(Date.now() + 86400000).toISOString() });
    await prisma.quoteRequest.update({ where: { id: q.id }, data: { quoteExpiresAt: new Date(Date.now() - 1000) } });
    await expect(cancelQuoteRequest(userId, q.id)).rejects.toMatchObject({ status: 409 });
  });
});
