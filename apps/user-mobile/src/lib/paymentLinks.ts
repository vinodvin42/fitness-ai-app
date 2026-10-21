/**
 * Razorpay's UPI flow inside the checkout WebView opens payment apps with
 * links such as upi://pay?… or Android intent://…#Intent;scheme=upi;…;end. A
 * WebView can't follow those itself, so they are handed to the phone
 * (Linking.openURL). Returns the URL to open outside, or null for ordinary
 * pages the WebView should load. Pure, so tests/paymentLinks.check.cjs can
 * run it in plain Node.
 */
export function externalPaymentUrl(url: string): string | null {
  if (/^(https?|about|data|blob|javascript|file):/i.test(url)) return null;
  if (/^intent:\/\//i.test(url)) {
    const [target, fragment = ""] = url.slice("intent://".length).split("#Intent;");
    const scheme = /(?:^|;)scheme=([^;]+)/.exec(fragment)?.[1];
    return scheme ? `${scheme}://${target}` : null;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : null;
}
