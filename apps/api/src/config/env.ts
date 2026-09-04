import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 chars"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
  JWT_ACCESS_TTL_MIN: z.coerce.number().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  // Two-Factor Authentication (25 Aug 2026, Phase 4, gap §17) — encrypts
  // User.twoFactorSecret at rest (see lib/twoFactor.ts). Required/fail-fast
  // like the JWT secrets above, NOT optional-and-quietly-off like Razorpay/
  // Sentry/AI below: those are third-party integrations with no account
  // this build has access to, but this is core auth infrastructure this
  // app can (and must) generate a real value for itself, same as any JWT
  // secret — no external provider or business decision involved. Must be
  // exactly 32 raw bytes (64 hex chars) — AES-256-GCM's fixed key size,
  // unlike the JWT secrets' "at least 16 chars" — generate with:
  // openssl rand -hex 32
  TWO_FACTOR_ENCRYPTION_KEY: z
    .string()
    .length(64, "TWO_FACTOR_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes) — generate with: openssl rand -hex 32")
    .regex(/^[0-9a-fA-F]+$/, "TWO_FACTOR_ENCRYPTION_KEY must be hex-encoded"),
  // Admin console (Phase 6, 20 Aug 2026) — a deliberately separate secret
  // from JWT_ACCESS_SECRET above, so an admin session token can never be
  // mistaken for (or replayed as) a consumer session token, even if a
  // route handler had a bug. Required/fail-fast like the consumer JWT
  // secrets: this gates the internal staff console, so an unset secret
  // should stop the whole API from booting, not degrade quietly.
  // No refresh-token flow for admin yet (see adminAuth.service.ts) — a
  // longer-lived single access token was the deliberately simple choice
  // for a "plain functional auth, no design pass" first slice; re-login
  // on expiry rather than building rotation/refresh for an 8-person
  // internal tool.
  ADMIN_JWT_SECRET: z.string().min(16, "ADMIN_JWT_SECRET must be at least 16 chars"),
  ADMIN_JWT_ACCESS_TTL_MIN: z.coerce.number().default(480),
  // Coach marketplace (Phase 5, 20 Aug 2026) — a Professional is a real
  // mobile-app user (apps/coach-mobile), not an internal tool like
  // AdminUser, so it gets the same access+rotating-refresh-token shape as
  // the consumer JWT secrets above, just with its own secret — same
  // "never interchangeable with another identity's token" reasoning as
  // ADMIN_JWT_SECRET.
  PROFESSIONAL_JWT_SECRET: z.string().min(16, "PROFESSIONAL_JWT_SECRET must be at least 16 chars"),
  PROFESSIONAL_JWT_ACCESS_TTL_MIN: z.coerce.number().default(15),
  PROFESSIONAL_JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((val) => val.split(",").map((s) => s.trim()).filter(Boolean)),
  // Razorpay (20 Aug 2026, gap §14) — deliberately optional, not
  // fail-fast like the JWT secrets above: payments are a bolt-on feature,
  // not required to boot the app at all, and this build environment has
  // no real merchant credentials to supply. See lib/razorpayClient.ts —
  // the client is constructed lazily, only when an endpoint actually
  // needs it, so an unconfigured Razorpay never blocks startup or any
  // route that doesn't touch payments.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_CURRENCY: z.string().default("INR"),
  // Go-live hardening (25 Aug 2026) — every seeded SubscriptionPlan/
  // Program price is USD-cent-denominated (e.g. Pro plan priceCents=1499
  // means $14.99), but RAZORPAY_CURRENCY defaults to INR — passing those
  // integers straight through as paisa would charge ₹14.99, undercharging
  // by roughly 80x. Rather than ship that silently, a *live* Razorpay key
  // (rzp_live_...) is refused at boot unless this is explicitly "true" —
  // see the check below. Test keys (rzp_test_...) boot freely, so a real
  // test-mode transaction can still be run before the pricing/currency
  // decision is finalized. Set this once that decision is actually made
  // (real INR list prices, or a USD-settling Razorpay account) — see
  // RUN-LOCALLY.md / the go-live plan's "Razorpay live keys + the
  // currency call" item.
  PRICE_CURRENCY_CONFIRMED: z
    .string()
    .default("false")
    .transform((val) => val.toLowerCase() === "true"),
  // Error monitoring (25 Aug 2026, go-live hardening) — optional, same
  // "unconfigured means quietly off, never blocks boot" pattern as
  // Razorpay/AI above. See lib/sentry.ts.
  SENTRY_DSN: z.string().optional(),
  // AI provider configuration (gap §13's infrastructure half only — see
  // lib/aiClient.ts's doc comment for what this does and doesn't cover).
  // Also optional/no fail-fast, same reasoning as Razorpay above.
  //
  // "azure-openai" (4 Sep 2026) — Azure OpenAI Service, added alongside
  // the existing Anthropic/OpenAI direct-API providers rather than
  // replacing them, since both of those already work and some deployments
  // (this one included — see infra/azure/*.bicep) run the rest of the
  // stack on Azure and want the AI calls billed through the same
  // subscription/resource group instead of a separate Anthropic/OpenAI
  // account. Azure OpenAI's request/response JSON shape is the same
  // Chat Completions shape OpenAI's own API uses (generateWithAzureOpenAi
  // in aiClient.ts reuses that parsing) — what's different is the URL
  // (a per-resource endpoint + "deployment name" instead of a bare model
  // name, since Azure OpenAI deploys a chosen base model under a name you
  // pick yourself) and auth (`api-key` header, not `Authorization: Bearer`).
  AI_PROVIDER: z.enum(["anthropic", "openai", "azure-openai"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  // Azure OpenAI — all four required together when AI_PROVIDER=azure-openai
  // (checked below, past what Zod's per-field .optional() can express, same
  // pattern as the CORS_ORIGINS/Razorpay checks further down this file).
  // AZURE_OPENAI_ENDPOINT is the resource's own base URL, e.g.
  // https://<resource-name>.openai.azure.com — no path or trailing slash.
  // AZURE_OPENAI_DEPLOYMENT is the deployment name you chose in Azure AI
  // Foundry / the Azure OpenAI resource when deploying a base model (e.g.
  // "gpt-4o-mini") — NOT the base model name itself; Azure OpenAI routes
  // by deployment name, not model name, since one resource can host several
  // differently-configured deployments of the same or different base models.
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(),
  // Pinned rather than defaulted-and-hidden — Azure OpenAI's REST API is
  // versioned independently of the base model, and a stale hardcoded
  // default would silently start failing (or silently miss newer request
  // fields) whenever Azure retires an old api-version. 2024-10-21 is the
  // current stable (non-preview) GA api-version as of this pass — confirmed
  // against Microsoft Learn's Azure OpenAI REST API reference. Override via
  // env if Azure moves the stable line before this comment is updated.
  AZURE_OPENAI_API_VERSION: z.string().default("2024-10-21"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loudly — a misconfigured .env should never silently boot
  // with a bad JWT secret or missing DB URL.
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Two more fail-fast checks, past what Zod's per-field schema can express
// on its own — both go-live hardening (25 Aug 2026), both deliberately
// refuse to boot rather than degrade quietly, matching this file's
// existing "a misconfigured .env should never silently boot" philosophy.
if (parsed.data.NODE_ENV === "production" && parsed.data.CORS_ORIGINS.length === 0) {
  // Empty CORS_ORIGINS previously fell back to `origin: true` in app.ts —
  // wide open to any origin, the opposite failure mode from "blocks the
  // real frontend." Neither silent default is right for production; force
  // an explicit value instead. Development/test keep the permissive
  // fallback (see app.ts) since that's genuinely convenient locally.
  console.error(
    "CORS_ORIGINS must be set in production — set it to your real deployed frontend origin(s), comma-separated.",
  );
  process.exit(1);
}

if (
  parsed.data.AI_PROVIDER === "azure-openai" &&
  (!parsed.data.AZURE_OPENAI_API_KEY || !parsed.data.AZURE_OPENAI_ENDPOINT || !parsed.data.AZURE_OPENAI_DEPLOYMENT)
) {
  // AI_PROVIDER itself stays optional/never blocks boot (see its own
  // comment above) — but *choosing* azure-openai and then leaving it half
  // configured is a real misconfiguration, not "feature quietly off": the
  // other two providers only need one key each to work, so a bare
  // AI_PROVIDER=azure-openai with nothing else set would otherwise boot
  // clean and then fail every single AI Coach message at request time
  // instead of at startup. Unset AI_PROVIDER entirely (or set it to
  // "anthropic"/"openai") to run with AI features off instead.
  console.error(
    "AI_PROVIDER=azure-openai requires AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and " +
      "AZURE_OPENAI_DEPLOYMENT all set. Set all three, or switch AI_PROVIDER to \"anthropic\"/\"openai\" " +
      "(or unset it) to run without Azure OpenAI.",
  );
  process.exit(1);
}

if (parsed.data.RAZORPAY_KEY_ID?.startsWith("rzp_live_") && !parsed.data.PRICE_CURRENCY_CONFIRMED) {
  console.error(
    "A live Razorpay key (rzp_live_...) is set, but PRICE_CURRENCY_CONFIRMED is not \"true\". " +
      "Every seeded price is USD-cent-denominated while Razorpay's native currency is INR — " +
      "booting like this would undercharge real customers by roughly 80x. Resolve the pricing/" +
      "currency decision first (real INR list prices, or a USD-settling account), then set " +
      "PRICE_CURRENCY_CONFIRMED=true. Test keys (rzp_test_...) are not blocked by this check.",
  );
  process.exit(1);
}

export const env = parsed.data;
