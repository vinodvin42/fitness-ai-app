/**
 * Connectivity harness — environment isolation guard (16 Oct 2026).
 *
 * The connectivity journeys write synthetic rows, so they must only ever
 * run against a disposable local PostgreSQL database created for them,
 * with every external side effect switched off. This module checks the
 * process environment BEFORE the API's config/env.ts is imported (it is
 * called from the Vitest setup file and from prepareDatabase.ts), and
 * refuses to continue when anything looks like a real environment.
 *
 * It never prints a secret: messages name the variable, never its value.
 *
 * databaseGuard.ts adds the second, database-side check (the server the
 * connection actually reached, and the harness marker table).
 */

export const HARNESS_OPT_IN_VAR = "FYNROX_CONNECTIVITY";
/** Database names the harness accepts: fynrox_<anything>_test. */
export const TEST_DATABASE_NAME = /^fynrox_[a-z0-9_]*_test$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
/** Database names that belong to other environments and are never accepted, even if renamed patterns change. */
const KNOWN_NON_TEST_DATABASES = new Set(["fitness_ai_app", "fitness_ai_app_ci", "postgres"]);

/** Must be absent: each one would send real email, reach a real service or a shared store. */
export const MUST_BE_UNSET = [
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "SENTRY_DSN",
  "REDIS_URL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
] as const;

/** Must hold exactly these values: deterministic local substitutes for the real providers. */
export const REQUIRED_VALUES: Record<string, string> = {
  NODE_ENV: "test",
  PAYMENT_PROVIDER: "mock", // HMAC-signed local mock, no network (providers/mockProviders.ts)
  FOOD_DATA_PROVIDER: "seed", // four built-in barcodes instead of Open Food Facts
  AI_PROVIDER: "mock", // canned text instead of an AI vendor call (lib/aiClient.ts)
  API_INSTANCE_COUNT: "1", // in-memory rate limiter, no Redis
};

/** Hosting-platform markers. Their presence means this is not a local machine. */
export const HOSTING_MARKERS = ["RENDER", "WEBSITE_SITE_NAME", "WEBSITE_INSTANCE_ID"] as const;

/** Credentials that must be test-only values, distinct from each other. */
export const TEST_ONLY_SECRETS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "ADMIN_JWT_SECRET",
  "PROFESSIONAL_JWT_SECRET",
  "GYM_JWT_SECRET",
  "INFLUENCER_JWT_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
] as const;
export const TEST_ONLY_PREFIX = "test-only-";

export interface ParsedDatabaseUrl {
  host: string;
  port: string;
  database: string;
}

export function parseDatabaseUrl(raw: string | undefined): ParsedDatabaseUrl | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return null;
    return { host: url.hostname, port: url.port || "5432", database: decodeURIComponent(url.pathname.replace(/^\//, "")) };
  } catch {
    return null;
  }
}

/** Returns every reason this environment is not an isolated harness environment (empty = OK). */
export function isolationProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];

  if (env[HARNESS_OPT_IN_VAR] !== "1") {
    problems.push(`${HARNESS_OPT_IN_VAR}=1 is not set (the harness only runs when explicitly asked for).`);
  }

  for (const [name, value] of Object.entries(REQUIRED_VALUES)) {
    if (env[name] !== value) problems.push(`${name} must be "${value}".`);
  }

  for (const name of MUST_BE_UNSET) {
    if (env[name]) problems.push(`${name} must be unset for the harness (it would reach a real service).`);
  }

  for (const name of HOSTING_MARKERS) {
    if (env[name]) problems.push(`${name} is set: this looks like a hosting platform, not a local machine.`);
  }

  const seen = new Map<string, string>();
  for (const name of TEST_ONLY_SECRETS) {
    const value = env[name];
    if (!value) {
      problems.push(`${name} must be set to a test-only value.`);
      continue;
    }
    if (!value.startsWith(TEST_ONLY_PREFIX)) problems.push(`${name} must start with "${TEST_ONLY_PREFIX}" (separate test credentials).`);
    const clash = seen.get(value);
    if (clash) problems.push(`${name} must differ from ${clash}.`);
    seen.set(value, name);
  }

  const db = parseDatabaseUrl(env.DATABASE_URL);
  if (!db) {
    problems.push("DATABASE_URL is missing or is not a postgresql:// URL.");
  } else {
    if (!LOOPBACK_HOSTS.has(db.host)) problems.push(`DATABASE_URL host must be localhost/127.0.0.1/::1 (got a non-local host).`);
    if (KNOWN_NON_TEST_DATABASES.has(db.database)) problems.push(`DATABASE_URL points at "${db.database}", a dev/CI database. Use a dedicated fynrox_*_test database.`);
    else if (!TEST_DATABASE_NAME.test(db.database)) problems.push(`DATABASE_URL database must be named fynrox_<name>_test (got "${db.database}").`);
  }

  return problems;
}

export function assertIsolatedEnvironment(env: Record<string, string | undefined> = process.env): void {
  const problems = isolationProblems(env);
  if (problems.length > 0) {
    throw new Error(
      "Connectivity harness refused to run — this is not an isolated test environment:\n  - " + problems.join("\n  - "),
    );
  }
}
