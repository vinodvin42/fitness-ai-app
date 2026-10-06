import React, { useMemo } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { RazorpayOrder, VerifyRazorpayPaymentInput } from "@fitness-ai-app/types";
import { colors } from "../theme/tokens";

interface Props {
  order: RazorpayOrder | null;
  /** Optional: opens Razorpay on this payment-method tab (checkout's own `prefill.method`). The user can still switch inside checkout. */
  preferredMethod?: "upi" | "card" | "netbanking";
  onSuccess: (result: VerifyRazorpayPaymentInput) => void;
  onDismiss: () => void;
}

/**
 * Opens Razorpay's own hosted Standard Checkout inside a WebView, rather
 * than linking Razorpay's native React Native SDK — that SDK needs native
 * module linking (a custom dev client / EAS build, not Expo Go or this
 * app's plain managed workflow), the same class of constraint gap §21
 * already documents for other native dependencies this build avoided.
 * `react-native-webview` is a well-supported Expo module with no
 * native-linking step of its own (see gap doc for its bundledNativeModules
 * version), so this works in this app's existing setup without ejecting.
 *
 * The checkout page is inlined as an HTML string (source={{ html }}), not
 * fetched from a URL, so it renders instantly regardless of this device's
 * own connection quality — only the checkout.js script tag and the actual
 * payment call need real network access, same as they would in a browser.
 *
 * `order` is null when there's nothing to check out — the modal renders
 * nothing in that case rather than the caller needing its own visibility
 * flag on top of the order state. See src/lib/useRazorpayPurchase.ts for
 * the hook that manages this component's props end to end.
 */
export function RazorpayCheckoutModal({ order, preferredMethod, onSuccess, onDismiss }: Props) {
  const html = useMemo(() => (order ? buildCheckoutHtml(order, preferredMethod) : ""), [order, preferredMethod]);

  if (!order) return null;

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "success") {
        onSuccess({
          razorpayOrderId: data.razorpayOrderId,
          razorpayPaymentId: data.razorpayPaymentId,
          razorpaySignature: data.razorpaySignature,
        });
      } else {
        // "dismiss" (user closed the checkout sheet) and "failed" (Razorpay
        // itself reported a failed payment) both just close this modal —
        // there's no partial/pending state to show, the user can simply
        // retry from the screen that opened this.
        onDismiss();
      }
    } catch {
      onDismiss();
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onDismiss} presentationStyle="pageSheet">
      <View style={styles.container}>
        <WebView originWhitelist={["*"]} source={{ html }} onMessage={onMessage} style={styles.webview} />
      </View>
    </Modal>
  );
}

function buildCheckoutHtml(order: RazorpayOrder, preferredMethod?: "upi" | "card" | "netbanking"): string {
  const options = {
    key: order.keyId,
    amount: order.amountCents,
    currency: order.currency,
    name: order.name,
    description: order.description,
    order_id: order.orderId,
    theme: { color: colors.accent },
    ...(preferredMethod ? { prefill: { method: preferredMethod } } : {}),
  };

  // Razorpay's own checkout.js reads `options` and posts the result back
  // via window.ReactNativeWebView.postMessage — the bridge react-native-
  // webview injects into every page it loads, no extra setup needed.
  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;background:${colors.background}">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var options = ${JSON.stringify(options)};
  options.handler = function (response) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "success",
      razorpayOrderId: response.razorpay_order_id,
      razorpayPaymentId: response.razorpay_payment_id,
      razorpaySignature: response.razorpay_signature,
    }));
  };
  options.modal = {
    ondismiss: function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismiss" }));
    },
  };
  var rzp = new Razorpay(options);
  rzp.on("payment.failed", function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "failed" }));
  });
  rzp.open();
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  webview: { flex: 1, backgroundColor: colors.background },
});
