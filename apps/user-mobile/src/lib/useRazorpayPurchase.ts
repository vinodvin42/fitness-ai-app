import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { PaymentPurpose, RazorpayOrder, VerifyRazorpayPaymentResult } from "@fitness-ai-app/types";
import { createRazorpayOrder, verifyRazorpayPayment, fetchPaymentsConfig } from "../api/payments";
import { extractErrorMessage } from "./apiError";

/**
 * Go-live hardening (3 Sep 2026) — whether to show a real Subscribe/
 * Purchase button or a "Coming soon" one, decided *before* a tap rather
 * than after a 503 (see payments.ts's fetchPaymentsConfig doc comment).
 * Defaults `configured: true` while the request is in flight rather than
 * `false` — this is a fast, same-origin, unauthenticated GET, so the
 * loading window is brief, and defaulting to "true" means the worst case
 * is the pre-existing behaviour (a tap that resolves to today's graceful
 * 503 + Alert), never a false "Coming soon" flash while this is still
 * unconfigured on a fresh app any given screen visits. A 10-minute
 * staleTime is plenty — this value doesn't change without a server
 * redeploy.
 */
export function usePaymentsConfigured() {
  const { data, isLoading } = useQuery({
    queryKey: ["payments", "config"],
    queryFn: fetchPaymentsConfig,
    staleTime: 10 * 60_000,
  });
  return { configured: data?.configured ?? true, isLoading };
}

interface Options {
  /** Called after a payment has been verified server-side — invalidate whatever queries this screen needs re-fetched (mirrors the same pattern every other mutation in this app already uses). Receives the full verify result (PAY-01, 5 Sep 2026) — a booking purchase needs `result.booking` to navigate to Booking Confirmation without a second request; Subscribe/Program Purchase ignore the argument, same as before. Return type is unconstrained since callers commonly return `Promise.all([...])` of several invalidations. */
  onVerified: (result: VerifyRazorpayPaymentResult) => unknown;
  /** Optional (31 Aug 2026) — a screen that wants dedicated Payment Success / Failed screens (§M) passes these; when present they REPLACE the default Alert so the flow isn't shown twice. Screens without them (Program/Workout purchase) keep the original Alert behaviour. */
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

/**
 * Shared checkout-flow state machine for both the Subscribe (§M) and
 * Program Purchase (§I) flows — extracted so the create-order / open-
 * checkout / verify-payment sequence is written once, not copy-pasted
 * across SubscriptionScreen, ProgramDetailScreen, and WorkoutDetailScreen.
 * Pair with <RazorpayCheckoutModal order={order} onSuccess={onCheckoutSuccess} onDismiss={onCheckoutDismiss} />
 * rendered as a sibling in the same screen.
 */
export function useRazorpayPurchase({ onVerified, onSuccess, onError }: Options) {
  const [order, setOrder] = useState<RazorpayOrder | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const reportError = useCallback(
    (title: string, message: string) => {
      if (onError) onError(message);
      else Alert.alert(title, message);
    },
    [onError],
  );

  const purchase = useCallback(
    async (purpose: PaymentPurpose, referenceId: string, couponCode?: string, scheduledAt?: string) => {
      setIsCreatingOrder(true);
      try {
        const created = await createRazorpayOrder({ purpose, referenceId, couponCode, scheduledAt });
        setOrder(created);
      } catch (err) {
        reportError("Couldn't start checkout", extractErrorMessage(err, "Check your connection and try again."));
      } finally {
        setIsCreatingOrder(false);
      }
    },
    [reportError],
  );

  const onCheckoutSuccess = useCallback(
    async (result: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) => {
      setOrder(null);
      setIsVerifying(true);
      try {
        const verifyResult = await verifyRazorpayPayment(result);
        await onVerified(verifyResult);
        onSuccess?.();
      } catch (err) {
        reportError(
          "Payment couldn't be verified",
          extractErrorMessage(err, "If you were charged, contact support with your payment ID."),
        );
      } finally {
        setIsVerifying(false);
      }
    },
    [onVerified, onSuccess, reportError],
  );

  const onCheckoutDismiss = useCallback(() => setOrder(null), []);

  return {
    order,
    purchase,
    isPurchasing: isCreatingOrder || isVerifying,
    onCheckoutSuccess,
    onCheckoutDismiss,
  };
}
