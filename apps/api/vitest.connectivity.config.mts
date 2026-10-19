import { defineConfig } from "vitest/config";

/**
 * Connectivity journeys (16 Oct 2026) — a separate suite from the normal
 * `vitest run` (vitest.config.mts only includes tests/**\/*.test.ts, and
 * these files are named *.journey.ts, so CI's normal test step never runs
 * them).
 *
 * globalSetup refuses to run unless the environment is isolated (local,
 * fynrox_*_test database carrying the harness marker, test-only secrets,
 * external side effects off), then seeds a fresh synthetic world.
 * setupFiles re-checks isolation in every worker before the app loads.
 * See tests/connectivity/README.md.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/connectivity/**/*.journey.ts"],
    globalSetup: ["tests/connectivity/harness/globalSetup.ts"],
    setupFiles: ["tests/connectivity/harness/setupEnv.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    // Within a file the steps build on each other (e.g. C1 → C2).
    sequence: { concurrent: false, shuffle: false },
  },
});
