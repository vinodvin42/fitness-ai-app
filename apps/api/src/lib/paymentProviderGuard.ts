/**
 * Fail-closed guard for the mock payment provider (Batch 0, Oct 2026).
 *
 * The mock signs payments with a secret that is written in source
 * (providers/mockProviders.ts), so anyone can forge a "valid" payment
 * while it is active. It must therefore never run anywhere real money or
 * real users could be involved.
 *
 * NODE_ENV alone is not enough: env.ts defaults NODE_ENV to "development"
 * when it is unset, so a deployment that simply forgot to set it would
 * pass a NODE_ENV-only check. This guard also refuses when it can see it
 * is running on a hosting platform, whatever NODE_ENV says:
 *   - Render sets RENDER="true" on every service
 *     (https://render.com/docs/environment-variables).
 *   - Azure App Service sets the read-only WEBSITE_SITE_NAME /
 *     WEBSITE_INSTANCE_ID (https://learn.microsoft.com/azure/app-service/reference-app-settings).
 * and when a live Razorpay key is configured next to the mock.
 *
 * Pure function so it can be tested without reloading env.ts; env.ts calls
 * it at import time (so every entry point — the API server, seed and
 * backfill scripts — is covered), and providers/index.ts calls it again
 * when it picks the provider.
 */
export interface PaymentProviderGuardInput {
  paymentProvider: string;
  nodeEnv: string;
  razorpayKeyId?: string;
  /** The raw process environment, for hosting-platform markers. */
  processEnv: Record<string, string | undefined>;
}

const HOSTING_MARKERS: Array<{ name: string; matches: (value: string | undefined) => boolean; platform: string }> = [
  { name: "RENDER", matches: (v) => v === "true", platform: "Render" },
  { name: "WEBSITE_SITE_NAME", matches: (v) => !!v, platform: "Azure App Service" },
  { name: "WEBSITE_INSTANCE_ID", matches: (v) => !!v, platform: "Azure App Service" },
];

/** Returns why the mock payment provider must not run here, or null when it may. */
export function mockPaymentProviderBlockReason(input: PaymentProviderGuardInput): string | null {
  if (input.paymentProvider !== "mock") return null;

  if (input.nodeEnv !== "development" && input.nodeEnv !== "test") {
    return `PAYMENT_PROVIDER=mock is a local-development stub and must not be used when NODE_ENV=${input.nodeEnv}.`;
  }

  const marker = HOSTING_MARKERS.find((m) => m.matches(input.processEnv[m.name]));
  if (marker) {
    return (
      `PAYMENT_PROVIDER=mock must not be used on a hosted environment (${marker.platform} detected via ${marker.name}), ` +
      `even when NODE_ENV is "${input.nodeEnv}". Set PAYMENT_PROVIDER=razorpay, or leave it unset.`
    );
  }

  if (input.razorpayKeyId?.startsWith("rzp_live_")) {
    return "PAYMENT_PROVIDER=mock must not be combined with a live Razorpay key (rzp_live_...).";
  }

  return null;
}

/** Throws when the mock payment provider is not allowed in this environment. */
export function assertPaymentProviderIsSafe(input: PaymentProviderGuardInput): void {
  const reason = mockPaymentProviderBlockReason(input);
  if (reason) throw new Error(reason);
}
