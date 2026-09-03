import * as Sentry from "@sentry/node";
import { env } from "../config/env";

/**
 * Error monitoring (25 Aug 2026, go-live hardening). Before this, the
 * only visibility into a production error was console.error to stdout
 * (middleware/errorHandler.ts) — a real incident would be invisible until
 * a user complained. Same "unconfigured means quietly off, never blocks
 * boot" pattern every other optional integration in this build follows
 * (Razorpay, AI) — an empty SENTRY_DSN just means initSentry() is a
 * no-op, nothing crashes or degrades.
 *
 * Called once, as early as possible, from index.ts — before createApp()
 * — so Sentry can also catch anything that throws during app setup
 * itself, not just inside a request handler.
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Conservative default — enough to see error frequency without
    // committing to a real perf-tracing budget on day one. Revisit once
    // there's real production traffic to tune against.
    tracesSampleRate: 0.1,
  });
}

export function captureException(err: unknown): void {
  if (!env.SENTRY_DSN) {
    return;
  }
  Sentry.captureException(err);
}

/**
 * Added the same day this file was first written, once it became clear
 * Module 12.06 — Integrations (`adminIntegrations.service.ts`) needed it:
 * that screen's whole job is showing which external services are wired
 * up, and Sentry became a real one the moment this file did — mirrors
 * `razorpayClient.ts`'s `isRazorpayConfigured()` / `aiClient.ts`'s
 * `getAiProviderStatus()` exactly, so `adminIntegrations` can report a
 * third real row instead of the screen silently going stale the moment a
 * new integration was added.
 */
export function isSentryConfigured(): boolean {
  return Boolean(env.SENTRY_DSN);
}
