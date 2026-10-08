import crypto from "node:crypto";
import type {
  CreateOrderInput,
  DeepLink,
  DeepLinkProvider,
  DeepLinkTarget,
  FoodDataProvider,
  PaymentProvider,
  PayoutProvider,
  PayoutRequest,
  PayoutResult,
  ProviderOrder,
  ProviderRefund,
  VerifySignatureInput,
} from "./types";
import type { BarcodeLookupResult } from "../lib/openFoodFactsClient";
import { BRAND_LINK_BASE_URL, BRAND_LINK_DOMAIN } from "@fitness-ai-app/config";

/**
 * The mock half of §11's "adapter interfaces with a mock
 * implementation". These exist so R1 can be developed, demoed and tested
 * end to end while D4/D5/D8 are still open.
 *
 * Every mock here is honest about being one. None of them fabricates a
 * success that a real provider would have refused: the payment mock
 * signs its own orders with a real HMAC so signature verification is
 * genuinely exercised rather than stubbed to `true`, and the payout mock
 * fails deterministically for a marked payee so the failure path is
 * reachable in a demo. A mock that always succeeds tests nothing and
 * teaches the team that the unhappy path does not exist.
 */

const MOCK_SECRET = "mock-payment-provider-secret";

export const mockPaymentProvider: PaymentProvider = {
  name: "mock",

  // Always "configured": that is the point of the mock. Nothing about it
  // reaches the network.
  isConfigured() {
    return true;
  },

  async createOrder(_input: CreateOrderInput): Promise<ProviderOrder> {
    // Deterministic-ish but unique, and visibly a mock id in any log or
    // admin screen, so nobody mistakes a dev order for a real one.
    return { id: `mock_order_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` };
  },

  verifySignature(input: VerifySignatureInput): boolean {
    // Real HMAC over the same payload shape Razorpay uses, so a client
    // integrating against the mock exercises the real verification path
    // and a wrong signature genuinely fails.
    const expected = crypto
      .createHmac("sha256", MOCK_SECRET)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest("hex");
    return expected === input.signature;
  },

  async refund(_providerPaymentId: string, _amountCents: number): Promise<ProviderRefund> {
    return { id: `mock_refund_${crypto.randomUUID().slice(0, 8)}` };
  },
};

/** Signs a payload the way `mockPaymentProvider` expects. Test/dev only. */
export function mockPaymentSignature(orderId: string, paymentId: string): string {
  return crypto.createHmac("sha256", MOCK_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}

/**
 * D5's placeholder. Fails for any payee reference containing
 * "fail" — a deliberate, documented hook so the payout-failed states
 * (C-M2, and the partially_failed batch status) can be demonstrated
 * without editing code or corrupting data by hand.
 */
export const mockPayoutProvider: PayoutProvider = {
  name: "mock",

  /**
   * Reports FALSE, unlike `mockPaymentProvider` above — and the
   * difference is deliberate.
   *
   * The payment mock is opt-in: you get it by setting
   * PAYMENT_PROVIDER=mock, so if you are using it you know what it is.
   * This one is the only payout implementation that exists, so it is
   * what every environment resolves to whether it meant to or not. If it
   * claimed to be configured, an admin completing a payout run would be
   * told money moved when nothing did — a lie about money, told by
   * default, to the person least able to check. Callers branch on this
   * to record intent rather than settlement.
   */
  isConfigured() {
    return false;
  },

  async send(request: PayoutRequest): Promise<PayoutResult> {
    if (request.payeeRef.toLowerCase().includes("fail")) {
      return {
        ok: false,
        providerPayoutId: null,
        failureReason: "Mock provider: payee reference marked as failing",
      };
    }
    return { ok: true, providerPayoutId: `mock_payout_${crypto.randomUUID().slice(0, 8)}`, failureReason: null };
  },
};

/**
 * D8's seed list — "FoodDataProvider adapter + small seed list". Real
 * barcodes for products common in the India-first R1 market, so a
 * barcode demo works with no network and no vendor contract. Values are
 * per-100g as printed on the pack.
 */
const SEED_FOODS: Record<string, BarcodeLookupResult & { found: true }> = {
  "8901491101837": {
    found: true,
    product: {
      name: "Lay's Classic Salted",
      brand: "Lay's",
      imageUrl: null,
      servingSize: "100 g",
      basis: "100g",
      calories: 536,
      proteinG: 6.6,
      carbsG: 53,
      fatG: 34,
    },
  },
  "8901058000368": {
    found: true,
    product: {
      name: "Maggi 2-Minute Masala Noodles",
      brand: "Nestlé",
      imageUrl: null,
      servingSize: "100 g",
      basis: "100g",
      calories: 402,
      proteinG: 9.1,
      carbsG: 56,
      fatG: 15.7,
    },
  },
  "8901725000103": {
    found: true,
    product: {
      name: "Amul Taaza Toned Milk",
      brand: "Amul",
      imageUrl: null,
      servingSize: "100 ml",
      basis: "100g",
      calories: 58,
      proteinG: 3.1,
      carbsG: 4.7,
      fatG: 3,
    },
  },
  "8904004400014": {
    found: true,
    product: {
      name: "Paneer",
      brand: "Mother Dairy",
      imageUrl: null,
      servingSize: "100 g",
      basis: "100g",
      calories: 296,
      proteinG: 18.3,
      carbsG: 1.2,
      fatG: 25,
    },
  },
};

export const seedFoodDataProvider: FoodDataProvider = {
  name: "seed",

  isConfigured() {
    return true;
  },

  async lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
    return SEED_FOODS[barcode.trim()] ?? { found: false };
  },
};

/**
 * D6's fallback, used until Branch or AppsFlyer is chosen: "Adapter; web
 * fallback to Early Access."
 *
 * It builds a real app URL from the app's own URL scheme and a real web
 * URL on fynrox.app, and it carries the attribution explicitly so the
 * deferred case (install, then first open) has something to hand over.
 * What it cannot do is survive an App Store round trip on its own —
 * that is exactly what a real provider buys, and pretending otherwise
 * here would hide the gap.
 */
export const webFallbackDeepLinkProvider: DeepLinkProvider = {
  name: "web-fallback",

  // Honest: no third-party deferred deep linking is configured. Callers
  // use this to decide whether to promise "we'll take you straight
  // there" or the weaker "open the app and enter your code".
  isConfigured() {
    return false;
  },

  build(target: DeepLinkTarget): DeepLink {
    switch (target.kind) {
      case "gym_invite":
        return {
          appUrl: `fynrox://gym/${target.gymCode}`,
          webUrl: `${BRAND_LINK_BASE_URL}/gym/${target.gymCode}`,
          attribution: { source: "gym", gymCode: target.gymCode },
        };
      case "creator_referral":
        return {
          appUrl: `fynrox://r/${target.creatorCode}`,
          webUrl: `${BRAND_LINK_BASE_URL}/r/${target.creatorCode}`,
          attribution: { source: "creator", creatorCode: target.creatorCode },
        };
      case "program":
        return {
          appUrl: `fynrox://program/${target.programId}`,
          webUrl: `${BRAND_LINK_BASE_URL}/programs/${target.programId}`,
          attribution: { source: "web", programId: target.programId },
        };
    }
  },
};

export const DEEP_LINK_HOST = BRAND_LINK_DOMAIN;
