import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertPaymentProviderIsSafe, mockPaymentProviderBlockReason } from "../src/lib/paymentProviderGuard";

/**
 * Batch 0 — the mock payment provider signs with a secret written in
 * source, so it must fail closed anywhere real: production, or any
 * detected hosting platform even when NODE_ENV was left unset (env.ts
 * defaults it to "development").
 */

const base = { razorpayKeyId: undefined, processEnv: {} as Record<string, string | undefined> };

describe("mock payment provider guard (pure)", () => {
  it("never blocks the real gateway", () => {
    for (const nodeEnv of ["production", "development", "test"]) {
      expect(mockPaymentProviderBlockReason({ ...base, paymentProvider: "razorpay", nodeEnv, processEnv: { RENDER: "true" } })).toBeNull();
    }
  });

  it("blocks the mock when NODE_ENV=production", () => {
    expect(mockPaymentProviderBlockReason({ ...base, paymentProvider: "mock", nodeEnv: "production" })).toMatch(/NODE_ENV=production/);
    expect(() => assertPaymentProviderIsSafe({ ...base, paymentProvider: "mock", nodeEnv: "production" })).toThrow();
  });

  it("allows the mock for local development and tests", () => {
    expect(mockPaymentProviderBlockReason({ ...base, paymentProvider: "mock", nodeEnv: "development" })).toBeNull();
    expect(mockPaymentProviderBlockReason({ ...base, paymentProvider: "mock", nodeEnv: "test" })).toBeNull();
  });

  it("blocks the mock on Render even if NODE_ENV was left unset (defaults to development)", () => {
    expect(
      mockPaymentProviderBlockReason({ ...base, paymentProvider: "mock", nodeEnv: "development", processEnv: { RENDER: "true" } }),
    ).toMatch(/Render/);
  });

  it("blocks the mock on Azure App Service even if NODE_ENV was left unset", () => {
    expect(
      mockPaymentProviderBlockReason({ ...base, paymentProvider: "mock", nodeEnv: "development", processEnv: { WEBSITE_SITE_NAME: "fynrox-api" } }),
    ).toMatch(/Azure App Service/);
    expect(
      mockPaymentProviderBlockReason({ ...base, paymentProvider: "mock", nodeEnv: "test", processEnv: { WEBSITE_INSTANCE_ID: "abc123" } }),
    ).toMatch(/Azure App Service/);
  });

  it("ignores a RENDER variable that is not exactly \"true\"", () => {
    expect(mockPaymentProviderBlockReason({ ...base, paymentProvider: "mock", nodeEnv: "development", processEnv: { RENDER: "" } })).toBeNull();
  });

  it("blocks the mock next to a live Razorpay key", () => {
    expect(
      mockPaymentProviderBlockReason({ ...base, paymentProvider: "mock", nodeEnv: "development", razorpayKeyId: "rzp_live_abc" }),
    ).toMatch(/live Razorpay key/);
    expect(mockPaymentProviderBlockReason({ ...base, paymentProvider: "mock", nodeEnv: "development", razorpayKeyId: "rzp_test_abc" })).toBeNull();
  });
});

/**
 * Boot-level proof: load the real config/env.ts in a child process (the
 * same module every entry point imports) and check the exit code. Uses
 * tsx, which apps/api already runs its dev server and scripts with.
 */
describe("mock payment provider guard (boot)", () => {
  const apiRoot = path.resolve(__dirname, "..");
  const syntheticEnv = {
    PATH: process.env.PATH,
    // Never read a developer's apps/api/.env into these children (dotenv
    // would add e.g. a local RAZORPAY_KEY_ID and change the outcome).
    DOTENV_CONFIG_PATH: path.join(apiRoot, "tests", "__no_such_dotenv_file__"),
    DATABASE_URL: "postgresql://synthetic:synthetic@localhost:5432/never_connected",
    JWT_ACCESS_SECRET: "synthetic-test-secret-aaaaaaaa",
    JWT_REFRESH_SECRET: "synthetic-test-secret-bbbbbbbb",
    ADMIN_JWT_SECRET: "synthetic-test-secret-cccccccc",
    PROFESSIONAL_JWT_SECRET: "synthetic-test-secret-dddddddd",
    GYM_JWT_SECRET: "synthetic-test-secret-eeeeeeee",
    INFLUENCER_JWT_SECRET: "synthetic-test-secret-ffffffff",
    TWO_FACTOR_ENCRYPTION_KEY: "0".repeat(64),
    CORS_ORIGINS: "http://localhost:5173",
  };
  const boot = (extra: Record<string, string>) =>
    spawnSync(process.execPath, ["--import", "tsx", "-e", "import('./src/config/env.ts').then(() => console.log('BOOTED'))"], {
      cwd: apiRoot,
      env: { ...syntheticEnv, ...extra },
      encoding: "utf8",
      timeout: 60_000,
    });

  it("refuses to boot with PAYMENT_PROVIDER=mock and NODE_ENV=production", () => {
    const r = boot({ NODE_ENV: "production", PAYMENT_PROVIDER: "mock" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/PAYMENT_PROVIDER=mock/);
    expect(r.stdout).not.toMatch(/BOOTED/);
  });

  it("refuses to boot with the mock on Render when NODE_ENV is unset", () => {
    const r = boot({ PAYMENT_PROVIDER: "mock", RENDER: "true" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Render/);
  });

  it("boots with the mock for local development", () => {
    const r = boot({ NODE_ENV: "development", PAYMENT_PROVIDER: "mock" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/BOOTED/);
  });

  it("boots in production with the real gateway selected", () => {
    const r = boot({ NODE_ENV: "production", PAYMENT_PROVIDER: "razorpay" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/BOOTED/);
  });
});
