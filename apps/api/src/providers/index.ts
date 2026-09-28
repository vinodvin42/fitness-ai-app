import { env } from "../config/env";
import { razorpayPaymentProvider } from "./razorpayPaymentProvider";
import { openFoodFactsProvider } from "./openFoodFactsProvider";
import {
  mockPaymentProvider,
  mockPayoutProvider,
  seedFoodDataProvider,
  webFallbackDeepLinkProvider,
} from "./mockProviders";
import { localObjectStorage } from "./localObjectStorage";
import type {
  DeepLinkProvider,
  FoodDataProvider,
  ObjectStorageProvider,
  PaymentProvider,
  PayoutProvider,
} from "./types";

export * from "./types";
export { mockPaymentSignature } from "./mockProviders";

/**
 * Provider selection — §12's "code it behind config so the final answer
 * is a setting change", applied to D4, D5, D6 and D8.
 *
 * Defaults are chosen so an unconfigured environment is honest rather
 * than broken:
 *
 * - Payments ALWAYS resolve to the real gateway unless the mock is asked
 *   for by name. The first draft of this file fell back to the mock
 *   whenever Razorpay credentials were missing, which is a genuinely
 *   dangerous default: a production deploy that lost its credentials
 *   would have started "accepting" payments that never happened, instead
 *   of failing loudly. An unconfigured gateway must stay a clean 503 —
 *   the existing tests assert exactly that, and they were right to.
 *   Using the mock is therefore always an explicit act
 *   (PAYMENT_PROVIDER=mock), never something an environment drifts into.
 * - Food data defaults to Open Food Facts, falling back to the seed list
 *   only when explicitly asked, so a network blip never silently
 *   narrows the catalogue to four products.
 * - Payouts and deep links have no real implementation yet (D5, D6), so
 *   both resolve to their placeholder and both report
 *   `isConfigured() === false`. Callers must branch on that rather than
 *   assuming a payout was sent.
 */
function pickPaymentProvider(): PaymentProvider {
  return env.PAYMENT_PROVIDER === "mock" ? mockPaymentProvider : razorpayPaymentProvider;
}

function pickFoodDataProvider(): FoodDataProvider {
  return env.FOOD_DATA_PROVIDER === "seed" ? seedFoodDataProvider : openFoodFactsProvider;
}

export const paymentProvider: PaymentProvider = pickPaymentProvider();
export const payoutProvider: PayoutProvider = mockPayoutProvider;
export const foodDataProvider: FoodDataProvider = pickFoodDataProvider();
export const deepLinkProvider: DeepLinkProvider = webFallbackDeepLinkProvider;
// §11's "S3-compatible" storage. No vendor chosen, so this is the
// local-disk stand-in and it reports itself unconfigured.
export const objectStorage: ObjectStorageProvider = localObjectStorage;

/** Shown on the Admin integrations screen, so staff can see what is live. */
export function providerStatus() {
  return {
    payment: { name: paymentProvider.name, configured: paymentProvider.isConfigured() },
    payout: { name: payoutProvider.name, configured: payoutProvider.isConfigured() },
    foodData: { name: foodDataProvider.name, configured: foodDataProvider.isConfigured() },
    deepLink: { name: deepLinkProvider.name, configured: deepLinkProvider.isConfigured() },
    objectStorage: { name: objectStorage.name, configured: objectStorage.isConfigured() },
  };
}
