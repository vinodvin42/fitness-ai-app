import type { BarcodeLookupResult } from "../lib/openFoodFactsClient";

/**
 * Provider adapter interfaces.
 *
 * Spec §11's stack table: "Payments, SMS/OTP, food data, payouts —
 * adapter interfaces with a mock implementation; real providers plug in
 * later. Providers out of R1 scope." §12 names the specific open
 * decisions: D4 (payment provider), D5 (payout provider), D6 (deep link
 * provider), D8 (food database / barcode vendor).
 *
 * Before this, Razorpay and OpenFoodFacts were imported directly by the
 * services that used them, so "which provider" was a code change in
 * several files rather than a setting. These interfaces are the seam;
 * `index.ts` picks the implementation from config.
 *
 * Every interface here is written around what the ALREADY-EXISTING code
 * needed, not around a guess at a general payment abstraction — an
 * adapter designed for imagined future providers is how you get an
 * interface that fits none of them.
 */

// ---- Payments (D4) --------------------------------------------------

export type CreateOrderInput = {
  amountCents: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
};

export type ProviderOrder = {
  /** The provider's own order id, stored as `Payment.providerOrderId`. */
  id: string;
};

export type VerifySignatureInput = {
  orderId: string;
  paymentId: string;
  signature: string;
};

export type ProviderRefund = {
  id: string | null;
};

export interface PaymentProvider {
  /** Stable identifier, stored on the Payment row and shown in Admin. */
  readonly name: string;
  /** False when credentials are absent — callers degrade, never fake. */
  isConfigured(): boolean;
  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;
  /**
   * Verifies the client-side callback really came from the provider.
   * Returns false rather than throwing, so the caller decides the status
   * code — this is an authentication result, not an exception.
   */
  verifySignature(input: VerifySignatureInput): boolean;
  refund(providerPaymentId: string, amountCents: number): Promise<ProviderRefund>;
}

// ---- Payouts (D5) ---------------------------------------------------

export type PayoutRequest = {
  /** Our own batch id, so a provider callback can be traced back. */
  reference: string;
  amountCents: number;
  currency: string;
  payeeRef: string;
};

export type PayoutResult = {
  ok: boolean;
  providerPayoutId: string | null;
  /** Populated only when `ok` is false, and safe to show an admin. */
  failureReason: string | null;
};

export interface PayoutProvider {
  readonly name: string;
  isConfigured(): boolean;
  send(request: PayoutRequest): Promise<PayoutResult>;
}

// ---- Food data (D8) -------------------------------------------------

/**
 * Reuses `lib/openFoodFactsClient`'s own result type rather than
 * defining a thinner one. That type already carries the `basis`
 * ("serving" vs "100g") distinction the mobile client depends on to
 * label its pre-filled numbers honestly, and an adapter that dropped it
 * to look tidier would make every provider lossy to match the weakest
 * imaginable one.
 */
export interface FoodDataProvider {
  readonly name: string;
  isConfigured(): boolean;
  lookupBarcode(barcode: string): Promise<BarcodeLookupResult>;
}

// ---- Deep links (D6) ------------------------------------------------

export type DeepLinkTarget =
  | { kind: "gym_invite"; gymCode: string }
  | { kind: "creator_referral"; creatorCode: string }
  | { kind: "program"; programId: string };

export type DeepLink = {
  /** Opens the app when installed. */
  appUrl: string;
  /**
   * Where a browser should go. With no provider configured this is the
   * web fallback D6 names ("web fallback to Early Access") rather than a
   * store URL — D10 says store buttons stay hidden until real URLs
   * exist, so linking to one here would contradict it.
   */
  webUrl: string;
  /**
   * Attribution the app should claim on first open after install. Carried
   * explicitly rather than parsed back out of the URL, so deferred deep
   * linking has something to hand over.
   */
  attribution: Record<string, string>;
};

export interface DeepLinkProvider {
  readonly name: string;
  isConfigured(): boolean;
  build(target: DeepLinkTarget): DeepLink;
}

// ---- Object storage -------------------------------------------------

export type StoredObject = {
  /** Opaque key the caller persists; never a filesystem path. */
  key: string;
  /** Where the object can be fetched, valid for `expiresInSeconds`. */
  url: string;
  expiresAt: Date;
};

export type PutObjectInput = {
  /** Logical folder, e.g. "evidence" or "exports". Not user-controlled. */
  namespace: "evidence" | "meal-photos" | "exports";
  /** Original filename, used only to derive an extension. */
  filename: string;
  contentType: string;
  body: Buffer;
};

/**
 * Spec §11: "File storage — S3-compatible (evidence uploads, meal
 * photos, exports)".
 *
 * There is no real implementation yet — a vendor has not been chosen —
 * so `isConfigured()` reports false everywhere today and callers must
 * branch on it rather than assume a file was stored. The local
 * implementation exists so the upload paths can be built and tested
 * without one, and it is explicit about being unsuitable for more than
 * one instance.
 */
export interface ObjectStorageProvider {
  readonly name: string;
  isConfigured(): boolean;
  put(input: PutObjectInput): Promise<StoredObject>;
  /** Refreshes an expiring link without re-uploading. */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
