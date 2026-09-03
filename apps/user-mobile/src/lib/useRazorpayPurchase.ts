import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type { PaymentPurpose, RazorpayOrder } from "@fitness-ai-app/types";
import { createRazorpayOrder, verifyRazorpayPayment } from "../api/payments";
import { extractErrorMessage } from "./apiError";

interface Options {
  /** Called after a payment has been verified server-side — invalidate whatever queries this screen needs re-fetched (mirrors the same pattern every other mutation in this app already uses). Return type is unconstrained since callers commonly return `Promise.all([...])` of several invalidations. */
  onVerified: () => unknown;
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
    async (purpose: PaymentPurpose, referenceId: string, couponCode?: string) => {
      setIsCreatingOrder(true);
      try {
        const created = await createRazorpayOrder({ purpose, referenceId, couponCode });
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
        await verifyRazorpayPayment(result);
        await onVerified();
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
