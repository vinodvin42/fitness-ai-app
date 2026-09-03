import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { isRazorpayConfigured } from "../../lib/razorpayClient";
import { getAiProviderStatus } from "../../lib/aiClient";
import { isSentryConfigured } from "../../lib/sentry";

/**
 * Module 12.06 — Integrations (docs/admin/03-screen-inventory.md §12.06),
 * added 25 Aug 2026. The Figma spec is "a connected-integrations table and
 * an API keys card" — this ships the integrations table only, and every
 * row in that table is entirely real: each external service this build
 * wires up already had a real, reusable status helper written for a
 * different reason (`lib/razorpayClient.ts`'s `isRazorpayConfigured()`,
 * gap §14; `lib/aiClient.ts`'s `getAiProviderStatus()`, gap §13/§38; and
 * `lib/sentry.ts`'s `isSentryConfigured()`, added the same go-live
 * hardening pass as this module) — this is the first admin surface to
 * actually read any of them.
 *
 * - **Razorpay (Payment Gateway)** — real `isRazorpayConfigured()` status
 *   (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` both set) plus a real usage
 *   summary: count and captured-revenue sum of every `paid` `Payment` row
 *   with `provider: "razorpay"` (the only provider this build has ever
 *   had) — a genuine "here's what's actually flowing through this
 *   integration" number, not just an env-var presence check.
 * - **AI Provider (Anthropic/OpenAI)** — real `getAiProviderStatus()`
 *   (which provider is selected, whether its API key is set, which model),
 *   plus (25 Aug 2026, once AI Coach chat shipped — Phase 2 §H) a real
 *   usage count: every `AiCoachMessage` row with `role: "assistant"`, i.e.
 *   a reply the provider actually generated. No `amountCents` alongside
 *   it, unlike Razorpay's — this build tracks no per-call cost for either
 *   AI provider, and showing "$0.00 total" next to a real count would
 *   misreport a real (just untracked) cost as zero. See
 *   `AdminIntegrationUsageSummary.amountCents`'s own comment
 *   (packages/types) for why it became optional the same day.
 * - **Sentry (Error Monitoring)** — real `isSentryConfigured()` status.
 *   Not in the original Figma spec (this app has no error-monitoring
 *   integration before 25 Aug 2026) — added here the same pass Sentry
 *   itself was, rather than letting this screen go stale the moment a
 *   third real integration existed. `usageSummary` is `null` for a
 *   different reason than AI's: there's nothing to count (Sentry captures
 *   errors, it doesn't produce a transaction-style number this API's own
 *   database could aggregate).
 *
 * **API Keys card is honestly NOT built** — this is a consumer/admin app,
 * not a developer platform; no concept of an admin-issued, third-party-
 * facing API key exists anywhere in this build. Rendered via
 * `NotAvailablePanel` rather than an empty or fabricated card.
 *
 * Read-only — there's nothing to create/edit/delete here. Every
 * integration here is wired in code (env vars + a client wrapper), not an
 * admin-authored row; this screen reports real state, it doesn't manage
 * anything. **25 Aug 2026: gated by real RBAC too** —
 * `requirePermission("admin", "view")` (see `middleware/adminPermissions.ts`),
 * not just a session check.
 */

export async function listIntegrations() {
  const [paymentCount, revenueAgg, aiReplyCount] = await Promise.all([
    prisma.payment.count({ where: { provider: "razorpay", status: "paid" } }),
    prisma.payment.aggregate({ where: { provider: "razorpay", status: "paid" }, _sum: { amountCents: true } }),
    prisma.aiCoachMessage.count({ where: { role: "assistant" } }),
  ]);

  const ai = getAiProviderStatus();
  const sentryConfigured = isSentryConfigured();

  const integrations = [
    {
      id: "razorpay",
      name: "Razorpay",
      category: "payment_gateway" as const,
      configured: isRazorpayConfigured(),
      detail: isRazorpayConfigured()
        ? `Live — webhook ${env.RAZORPAY_WEBHOOK_SECRET ? "configured" : "not configured"}, settlement currency ${env.RAZORPAY_CURRENCY}`
        : "Not configured — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET",
      usageSummary:
        paymentCount > 0
          ? { label: "Payments captured", count: paymentCount, amountCents: revenueAgg._sum.amountCents ?? 0 }
          : null,
    },
    {
      id: "ai_provider",
      name: ai.provider === "anthropic" ? "Anthropic" : "OpenAI",
      category: "ai_provider" as const,
      configured: ai.configured,
      detail: ai.configured
        ? `API key set, model ${ai.model} — powering AI Coach chat (Phase 2 §H)`
        : `Not configured — set ${ai.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"}`,
      usageSummary: aiReplyCount > 0 ? { label: "AI Coach replies sent", count: aiReplyCount } : null,
    },
    {
      id: "sentry",
      name: "Sentry",
      category: "error_monitoring" as const,
      configured: sentryConfigured,
      detail: sentryConfigured
        ? `Capturing unhandled errors and uncaught exceptions in ${env.NODE_ENV}`
        : "Not configured — set SENTRY_DSN",
      usageSummary: null,
    },
  ];

  return {
    integrations,
    notAvailable: ["apiKeys"],
  };
}
