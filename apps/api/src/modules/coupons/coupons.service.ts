import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";

/**
 * Coupons — consumer side (docs/admin 06.05 Pricing's Coupons half + the
 * mobile checkout), added 31 Aug 2026. Admin-created discount codes
 * (adminCoupons.service.ts) applied at checkout. This module owns the
 * validation math and the redemption-recording that both the mobile
 * "apply coupon" field and the payments flow call.
 *
 * The redemption is recorded only when a payment is actually CAPTURED (see
 * recordRedemptionForPayment, called from payments.service.ts's
 * activatePayment) — never at order-creation time, so an abandoned or
 * failed checkout never burns a user's one allowed redemption. `amountCents`
 * on the Payment is stored already-discounted; the coupon code + discount
 * are stashed on the Payment so this choke point can reconcile them.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

// A discounted order can never be reduced below this, so a 100%-off (or
// large fixed) coupon still produces a real, chargeable Razorpay amount
// rather than a zero-amount order the gateway rejects. Honest limit,
// surfaced to the client in the validate response.
const MIN_CHARGE_CENTS = 100;

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxRedemptions: number | null;
  timesRedeemed: number;
  isActive: boolean;
  expiresAt: Date | null;
};

function computeDiscountCents(coupon: CouponRow, amountCents: number): number {
  const raw =
    coupon.discountType === "percent"
      ? Math.floor((amountCents * coupon.discountValue) / 100)
      : coupon.discountValue;
  // Never discount below the minimum chargeable amount.
  const maxDiscount = Math.max(0, amountCents - MIN_CHARGE_CENTS);
  return Math.min(raw, maxDiscount);
}

export type CouponValidation =
  | { valid: false; reason: string }
  | {
      valid: true;
      code: string;
      description: string | null;
      discountCents: number;
      finalCents: number;
    };

export async function validateCoupon(
  userId: string,
  rawCode: string,
  amountCents: number,
): Promise<CouponValidation> {
  const code = normalizeCode(rawCode);
  const coupon = (await prisma.coupon.findUnique({ where: { code } })) as CouponRow | null;

  if (!coupon || !coupon.isActive) return { valid: false, reason: "This code isn't valid." };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { valid: false, reason: "This code has expired." };
  }
  if (coupon.maxRedemptions != null && coupon.timesRedeemed >= coupon.maxRedemptions) {
    return { valid: false, reason: "This code has been fully redeemed." };
  }

  const alreadyUsed = await prisma.couponRedemption.findUnique({
    where: { couponId_userId: { couponId: coupon.id, userId } },
  });
  if (alreadyUsed) return { valid: false, reason: "You've already used this code." };

  const discountCents = computeDiscountCents(coupon, amountCents);
  if (discountCents <= 0) return { valid: false, reason: "This code can't be applied to this amount." };

  return {
    valid: true,
    code: coupon.code,
    description: coupon.description,
    discountCents,
    finalCents: amountCents - discountCents,
  };
}

/**
 * Record a redemption for a captured payment, idempotently. Called from
 * payments.service.ts's activatePayment (the single choke point both the
 * client /verify and the webhook funnel through). No-op unless the Payment
 * actually carried a coupon.
 */
export async function recordRedemptionForPayment(paymentId: string): Promise<void> {
  const payment = (await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, userId: true, couponCode: true, discountCents: true },
  })) as { id: string; userId: string; couponCode: string | null; discountCents: number | null } | null;

  if (!payment || !payment.couponCode) return;

  const coupon = (await prisma.coupon.findUnique({ where: { code: payment.couponCode } })) as CouponRow | null;
  if (!coupon) return; // coupon removed between order and capture — nothing to reconcile

  const existing = await prisma.couponRedemption.findUnique({
    where: { couponId_userId: { couponId: coupon.id, userId: payment.userId } },
  });
  if (existing) return; // already recorded — idempotent

  await prisma.couponRedemption.create({
    data: {
      couponId: coupon.id,
      userId: payment.userId,
      paymentId: payment.id,
      discountCents: payment.discountCents ?? 0,
    },
  });
  await prisma.coupon.update({ where: { id: coupon.id }, data: { timesRedeemed: { increment: 1 } } });

  await recordAudit({
    actorId: payment.userId,
    action: "coupon.redeemed",
    entityType: "Coupon",
    entityId: coupon.id,
    metadata: { paymentId: payment.id, discountCents: payment.discountCents ?? 0 },
  });
}
