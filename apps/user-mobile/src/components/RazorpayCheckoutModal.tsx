import React, { useMemo, useRef } from "react";
import { Linking, Modal, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { RazorpayOrder, VerifyRazorpayPaymentInput } from "@fitness-ai-app/types";
import { colors, themed } from "../theme/tokens";
import { externalPaymentUrl } from "../lib/paymentLinks";

interface Props {
  order: RazorpayOrder | null;
  /** Optional: opens Razorpay on this payment-method tab (checkout's own `prefill.method`). The user can still switch inside checkout. */
  preferredMethod?: "upi" | "card" | "netbanking";
  onSuccess: (result: VerifyRazorpayPaymentInput) => void;
  onDismiss: () => void;
  /**
   * Razorpay declined at least one attempt and the member then closed the sheet
   * (21 Oct 2026). The sheet stays open after a decline so Razorpay's own retry
   * shows; without this prop a closed sheet is just a dismiss.
   */
  onFailed?: (reason: string | null) => void;
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
export function RazorpayCheckoutModal({ order, preferredMethod, onSuccess, onDismiss, onFailed }: Props) {
  const html = useMemo(() => (order ? buildCheckoutHtml(order, preferredMethod) : ""), [order, preferredMethod]);
  // The last decline Razorpay reported for this sheet ("" when it gave no reason); null if none.
  const lastFailure = useRef<string | null>(null);

  const close = () => {
    const failure = lastFailure.current;
    lastFailure.current = null;
    if (failure !== null && onFailed) onFailed(failure || null);
    else onDismiss();
  };

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
      } else if (data.type === "failed") {
        // Razorpay keeps its sheet open after a decline so the member can retry
        // there; remember why, and report it only if they then close the sheet.
        lastFailure.current = typeof data.reason === "string" ? data.reason : "";
      } else {
        close();
      }
    } catch {
      close();
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
      <View style={styles.container}>
        <WebView
          originWhitelist={["*"]}
          source={{ html }}
          onMessage={onMessage}
          // UPI apps (upi://, intent://) open outside the WebView (lib/paymentLinks.ts).
          onShouldStartLoadWithRequest={(request) => {
            const external = externalPaymentUrl(request.url);
            if (!external) return true;
            Linking.openURL(external).catch(() => undefined);
            return false;
          }}
          style={styles.webview}
        />
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
    theme: { color: colors.accentText },
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
  rzp.on("payment.failed", function (response) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "failed",
      reason: response && response.error ? response.error.description : null,
    }));
  });
  rzp.open();
</script>
</body>
</html>`;
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  webview: { flex: 1, backgroundColor: colors.background },
}));
