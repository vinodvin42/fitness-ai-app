import { prisma } from "../../db/prisma";
import { r1Flags } from "@fitness-ai-app/config";
import { ApiHttpError } from "../../middleware/errorHandler";
import { validateCoupon } from "../coupons/coupons.service";
import { trackEvent } from "../../lib/analytics";
import { paymentProvider } from "../../providers";

/**
 * U-M1 — "Checkout: plan, price from API, UPI / card / netbanking,
 * 'Have a code?'".
 *
 * The handoff's §2 decision #7 is the constraint this exists to satisfy:
 * "No hard-coded prices in the app; prices come from the Commerce API."
 * Before this there was no checkout endpoint at all — the mobile app
 * opened a Razorpay modal from the Subscription screen, so there was
 * nowhere for a price breakdown, a GST line (D3) or a discount code to
 * live.
 *
 * This endpoint answers one question: "if I buy this, what exactly do I
 * pay, and how?" It writes nothing. Creating the order is still
 * `payments.service.ts#createOrder`, unchanged — a quote that silently
 * created a payment row would make an abandoned checkout indistinguishable
 * from a failed one.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

export type CheckoutMethod = {
  id: "upi" | "card" | "netbanking";
  label: string;
  /** False when the gateway cannot offer it in this configuration. */
  available: boolean;
};

/**
 * D3: "Prices from API; no trial; 'incl. GST' line." India-first, so the
 * displayed price is GST-inclusive and the line breaks out the tax
 * already contained in it rather than adding to it — showing a price and
 * then adding tax at the last step is exactly the pattern Indian
 * consumers do not expect, and the handoff asks for "incl. GST".
 */
const DEFAULT_GST_PERCENT = 18;

async function activeGstPercent(): Promise<number> {
  const config = await prisma.taxConfig.findFirst({
    where: { isActive: true, jurisdiction: "IN" },
    orderBy: { updatedAt: "desc" },
  });
  if (!config?.ratePercent) return DEFAULT_GST_PERCENT;
  return Number(config.ratePercent);
}

/** Splits a GST-inclusive total into its net and tax parts. */
export function splitGstInclusive(totalCents: number, gstPercent: number) {
  const netCents = Math.round(totalCents / (1 + gstPercent / 100));
  return { netCents, taxCents: totalCents - netCents };
}

export type CheckoutQuote = {
  purpose: "subscription" | "program_purchase";
  referenceId: string;
  itemName: string;
  currency: string;
  listPriceCents: number;
  discountCents: number;
  totalCents: number;
  gst: { percent: number; netCents: number; taxCents: number; inclusive: true } | null;
  couponCode: string | null;
  couponError: string | null;
  methods: CheckoutMethod[];
  /** D3: no trial in R1. Surfaced so the screen never invents one. */
  trialAvailable: boolean;
  /** False when the gateway is unconfigured — the screen must not offer to pay. */
  canPay: boolean;
};

/**
 * Builds the quote the checkout screen renders. `code` is the "Have a
 * code?" field; an invalid code is NOT an error — it returns the
 * undiscounted quote with `couponError` set, because failing the whole
 * checkout over a mistyped code is a worse outcome than showing the
 * price without it.
 */
export async function getCheckoutQuote(
  userId: string,
  input: { purpose: "subscription" | "program_purchase"; referenceId: string; code?: string | null },
): Promise<CheckoutQuote> {
  let itemName: string;
  let listPriceCents: number;
  // Single-currency in R1 (India first). Named rather than inlined so
  // the multi-currency change is one line, not a search for "INR".
  const currency = "INR";

  if (input.purpose === "subscription") {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.referenceId } });
    if (!plan || !plan.isActive) {
      throw new ApiHttpError(404, "plan_not_found", "That plan isn't available");
    }
    itemName = plan.name;
    listPriceCents = plan.priceCents;
  } else {
    // D2's default is "Included in Premium", so a programme is normally
    // not separately purchasable. The flag keeps the Admin price field
    // meaningful for later without letting the app sell against it.
    if (!r1Flags.PROGRAMS_SOLD_SEPARATELY) {
      throw new ApiHttpError(
        409,
        "programs_included_in_premium",
        "Programmes are included with Premium in R1 and aren't sold separately",
      );
    }
    const program = await prisma.program.findUnique({ where: { id: input.referenceId } });
    if (!program || program.status !== "published") {
      throw new ApiHttpError(404, "program_not_found", "That programme isn't available");
    }
    itemName = program.name;
    listPriceCents = program.priceCents ?? 0;
  }

  let discountCents = 0;
  let couponCode: string | null = null;
  let couponError: string | null = null;

  if (input.code?.trim()) {
    const result = await validateCoupon(userId, input.code, listPriceCents);
    if (result.valid) {
      discountCents = result.discountCents;
      couponCode = result.code;
    } else {
      couponError = result.reason;
    }
  }

  const totalCents = Math.max(0, listPriceCents - discountCents);
  const gstPercent = await activeGstPercent();

  await trackEvent(
    userId,
    "premium.checkout_started",
    { referenceId: input.referenceId },
    { ruleId: "BR-COM-011", metadata: { purpose: input.purpose, totalCents, couponApplied: couponCode != null } },
  );

  return {
    purpose: input.purpose,
    referenceId: input.referenceId,
    itemName,
    currency,
    listPriceCents,
    discountCents,
    totalCents,
    gst: r1Flags.SHOW_GST_INCLUSIVE_LINE
      ? { percent: gstPercent, ...splitGstInclusive(totalCents, gstPercent), inclusive: true }
      : null,
    couponCode,
    couponError,
    // The handoff names exactly these three (decision: "UPI / card /
    // netbanking"). They are listed rather than hard-coded in the client
    // so a gateway change is a server change.
    methods: [
      { id: "upi", label: "UPI", available: true },
      { id: "card", label: "Card", available: true },
      { id: "netbanking", label: "Net banking", available: true },
    ],
    trialAvailable: r1Flags.TRIAL_ENABLED,
    canPay: paymentProvider.isConfigured(),
  };
}

/**
 * U-M22 — "Refund status in purchase history".
 *
 * The Refund model has existed since 31 Aug 2026, but only Admin could
 * see one: a user whose refund was approved had no way to tell from the
 * app whether it had been issued, was still pending with the gateway, or
 * had failed. That is precisely the moment a user contacts support, so
 * the absence was expensive as well as wrong.
 *
 * Refunds are folded into the payment row rather than listed separately,
 * because "did I get my money back" is a question about a purchase, not
 * an independent event the user would think to go looking for.
 */
export async function listPurchaseHistory(userId: string) {
  const payments = await prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { refunds: { orderBy: { createdAt: "desc" } } },
  });

  return payments.map((p) => {
    const refunds = p.refunds ?? [];
    const refundedCents = refunds
      .filter((r) => r.status !== "failed")
      .reduce((sum, r) => sum + r.amountCents, 0);

    return {
      id: p.id,
      purpose: p.purpose,
      referenceId: p.referenceId,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      couponCode: p.couponCode,
      discountCents: p.discountCents,
      createdAt: p.createdAt,
      // §10: the payment stays SUCCESS through every entitlement state,
      // and a refund never rewrites it. The refund is reported alongside.
      refund:
        refunds.length === 0
          ? null
          : {
              // The newest refund's status is what the user is waiting on.
              status: refunds[0].status,
              refundedCents,
              isPartial: refundedCents > 0 && refundedCents < p.amountCents,
              requestedAt: refunds[0].createdAt,
              processedAt: refunds[0].processedAt,
              // The admin's internal reason is deliberately NOT exposed —
              // it is written for staff, can name other people, and is
              // not something the user asked to read.
            },
      // U-M4's "access recovery" signal, already stored but never sent to
      // this screen: a captured payment whose entitlement never activated.
      activationFailed: p.status === "paid" && p.activationFailedAt != null,
    };
  });
}
