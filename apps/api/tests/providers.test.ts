import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import {
  deepLinkProvider,
  foodDataProvider,
  mockPaymentSignature,
  paymentProvider,
  payoutProvider,
  providerStatus,
} from "../src/providers";
import { mockPaymentProvider, seedFoodDataProvider } from "../src/providers/mockProviders";

const app = buildApp();

/**
 * Spec §11: "Payments, SMS/OTP, food data, payouts — adapter interfaces
 * with a mock implementation; real providers plug in later", and §12's
 * D4/D5/D6/D8.
 *
 * The interesting assertions here are about HONESTY, not plumbing: a
 * provider layer whose mocks claim to be real is worse than no provider
 * layer, because it converts a missing integration into a silent lie.
 */
describe("Provider adapters (§11, D4/D5/D6/D8)", () => {
  it("never silently substitutes the mock gateway for a missing real one", () => {
    // The first draft of the selector fell back to the mock whenever
    // Razorpay credentials were absent. That would let a production
    // deploy that lost its credentials "accept" payments that never
    // happened. Selecting the mock must always be explicit.
    expect(paymentProvider.name).toBe("razorpay");
    expect(paymentProvider.isConfigured()).toBe(false); // no creds in this suite
  });

  it("reports the payout provider as unconfigured, because D5 has no real one", () => {
    // Unlike the payment mock (opt-in), this is what EVERY environment
    // resolves to today. Claiming to be configured would tell an admin
    // money moved when nothing did.
    expect(payoutProvider.isConfigured()).toBe(false);
  });

  it("reports deep links as unconfigured, because D6 is still open", () => {
    expect(deepLinkProvider.isConfigured()).toBe(false);
  });

  it("surfaces all four adapters with their real state", () => {
    const status = providerStatus();
    expect(status.payment.name).toBe("razorpay");
    expect(status.payout.configured).toBe(false);
    expect(status.deepLink.configured).toBe(false);
    expect(status.foodData.name).toBe("openfoodfacts");
  });

  describe("the payment mock is a real implementation, not a stub", () => {
    it("verifies a correctly signed payload and rejects a wrong one", () => {
      const orderId = "mock_order_abc";
      const paymentId = "mock_pay_xyz";
      const signature = mockPaymentSignature(orderId, paymentId);

      expect(mockPaymentProvider.verifySignature({ orderId, paymentId, signature })).toBe(true);
      // The point: a client integrating against the mock exercises the
      // real verification path, so a forged callback genuinely fails.
      expect(mockPaymentProvider.verifySignature({ orderId, paymentId, signature: "deadbeef" })).toBe(false);
      expect(
        mockPaymentProvider.verifySignature({ orderId, paymentId: "other", signature }),
      ).toBe(false);
    });

    it("issues order ids that are visibly mock ids", async () => {
      const order = await mockPaymentProvider.createOrder({
        amountCents: 1000,
        currency: "INR",
        receipt: "r",
        notes: {},
      });
      expect(order.id.startsWith("mock_order_")).toBe(true);
    });
  });

  describe("the food seed list (D8)", () => {
    it("resolves a seeded barcode with real per-100g values and a basis", async () => {
      const result = await seedFoodDataProvider.lookupBarcode("8901058000368");
      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.product.name).toContain("Maggi");
        // `basis` is the field a thinner adapter interface would have
        // dropped; the client needs it to label its numbers honestly.
        expect(result.product.basis).toBe("100g");
        expect(result.product.calories).toBeGreaterThan(0);
      }
    });

    it("returns not-found rather than inventing a product", async () => {
      expect((await seedFoodDataProvider.lookupBarcode("0000000000000")).found).toBe(false);
    });

    it("is not the default — a network blip must not narrow the catalogue", () => {
      expect(foodDataProvider.name).toBe("openfoodfacts");
    });
  });

  describe("deep link resolution (W-M2)", () => {
    let gymId = "";
    let campaignId = "";
    let influencerId = "";
    let sourceId = "";
    const suffix = uniqueSuffix();
    const gymCode = `DL${suffix.slice(-6).toUpperCase()}`;
    const creatorCode = `dl-${suffix}`;

    beforeAll(async () => {
      const gym = await prisma.gym.create({
        data: {
          name: "Deep Link Fixture Gym",
          status: "approved",
          contactName: "Owner",
          contactEmail: `dl-gym-${suffix}@example.com`,
          inviteCode: gymCode,
        },
      });
      gymId = gym.id;

      const influencer = await prisma.influencer.create({
        data: { name: "Deep Link Fixture Creator", commissionPct: 20, status: "active" },
      });
      influencerId = influencer.id;
      const source = await prisma.acquisitionSource.upsert({
        where: { channel: "influencer" },
        update: {},
        create: { channel: "influencer", label: "Creator" },
      });
      sourceId = source.id;
      const campaign = await prisma.campaign.create({
        data: { sourceId, name: "Deep Link Fixture Campaign", linkCode: creatorCode, influencerId, status: "active" },
      });
      campaignId = campaign.id;
    });

    afterAll(async () => {
      await prisma.campaign.deleteMany({ where: { id: campaignId } });
      await prisma.influencer.deleteMany({ where: { id: influencerId } });
      await prisma.gym.deleteMany({ where: { id: gymId } });
    });

    it("resolves a live gym invite to lowercase fynrox.app with attribution (Q4)", async () => {
      const res = await request(app).get(`/links/gym/${gymCode}`);
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.webUrl).toBe(`https://fynrox.app/gym/${gymCode}`);
      expect(res.body.attribution).toEqual({ source: "gym", gymCode });
      // D6 honesty: the website must not promise an automatic hand-off
      // it cannot deliver after an install.
      expect(res.body.deferredDeepLinkSupported).toBe(false);
    });

    it("resolves a live creator referral the same way", async () => {
      const res = await request(app).get(`/links/r/${creatorCode}`);
      expect(res.status).toBe(200);
      expect(res.body.webUrl).toBe(`https://fynrox.app/r/${creatorCode}`);
      expect(res.body.attribution.source).toBe("creator");
    });

    it("acceptance test 3: an unknown link lets the visitor continue with no attribution", async () => {
      const res = await request(app).get("/links/gym/NOSUCHCODE");
      expect(res.status).toBe(404);
      expect(res.body.valid).toBe(false);
      expect(res.body.continueWithoutAttribution).toBe(true);
      expect(res.body.attribution).toBeUndefined();
    });

    it("opens CORS for the public link routes WITHOUT credentials", async () => {
      // The marketing site may be on a different origin than the API, so
      // these two routes need an open origin. The dangerous part is the
      // pairing: an open origin PLUS credentials lets any site make
      // authenticated requests with a visitor's cookies. Two earlier
      // attempts at this shipped exactly that pair (two stacked cors()
      // layers, where one set the origin and the other the credentials),
      // so this asserts the absence, not just the presence.
      const res = await request(app).get(`/links/gym/${gymCode}`).set("Origin", "http://unrelated.example");
      expect(res.headers["access-control-allow-origin"]).toBe("http://unrelated.example");
      expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    });

    it("does NOT open CORS for an authenticated route", async () => {
      const res = await request(app).get("/users/me").set("Origin", "http://unrelated.example");
      // The allowlist must still refuse an unknown origin everywhere else.
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("treats a suspended gym's invite as dead, and does not say why", async () => {
      await prisma.gym.update({ where: { id: gymId }, data: { status: "suspended" } });
      const res = await request(app).get(`/links/gym/${gymCode}`);
      expect(res.status).toBe(404);
      expect(res.body.valid).toBe(false);
      // A public endpoint that distinguished "no such gym" from "that gym
      // is suspended" would be an enumeration oracle.
      expect(JSON.stringify(res.body)).not.toContain("suspend");
      await prisma.gym.update({ where: { id: gymId }, data: { status: "approved" } });
    });
  });
});
