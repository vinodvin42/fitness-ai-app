import type {
  CouponValidatePreview,
  CreateRazorpayOrderInput,
  PaymentStatusDetail,
  RazorpayOrder,
  RetryActivationResult,
  VerifyRazorpayPaymentInput,
  VerifyRazorpayPaymentResult,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

// Razorpay integration (20 Aug 2026, gap §14) — see
// apps/api/src/modules/payments's doc comment for the full flow this
// pairs with, and src/lib/useRazorpayPurchase.ts / RazorpayCheckoutModal.tsx
// for how the two calls below are actually used from a screen.

export function createRazorpayOrder(input: CreateRazorpayOrderInput) {
  return apiClient.post<RazorpayOrder>("/payments/razorpay/orders", input).then((r) => r.data);
}

export function verifyRazorpayPayment(input: VerifyRazorpayPaymentInput) {
  return apiClient.post<VerifyRazorpayPaymentResult>("/payments/razorpay/verify", input).then((r) => r.data);
}

// Go-live hardening (3 Sep 2026) — lets a screen know payments are parked
// for this pilot *before* a purchase attempt, instead of only finding out
// via a 503 after the tap. See useRazorpayPurchase.ts's usePaymentsConfigured().
export function fetchPaymentsConfig() {
  return apiClient.get<{ configured: boolean }>("/payments/config").then((r) => r.data);
}

// U6 Premium entitlement (15 Sep 2026, §9 / BR-COM-011) — the recoverable
// "payment succeeded, entitlement activation failed" state. See
// payments.service.ts's getPaymentForUser/retryActivation doc comments and
// PaymentResultScreen.tsx for how these are actually used.

export function fetchPaymentStatus(paymentId: string) {
  return apiClient.get<PaymentStatusDetail>(`/payments/${paymentId}`).then((r) => r.data);
}

export function retryPaymentActivation(paymentId: string) {
  return apiClient.post<RetryActivationResult>(`/payments/${paymentId}/retry-activation`).then((r) => r.data);
}

/** Pre-checkout coupon preview (POST /coupons/validate) - the server computes the discount; the order itself recomputes it again. */
export function validateCoupon(code: string, amountCents: number) {
  return apiClient.post<CouponValidatePreview>("/coupons/validate", { code, amountCents }).then((r) => r.data);
}
