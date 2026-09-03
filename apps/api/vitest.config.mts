import { defineConfig } from "vitest/config";

/**
 * Real, Postgres-backed integration tests (see apps/api/tests/*.test.ts) —
 * nothing here mocks Prisma or Express. Each file imports createApp() from
 * src/app.ts and drives it in-process with supertest, against whatever
 * DATABASE_URL points at: the local docker-compose Postgres in dev, or the
 * ephemeral service container CI spins up (see .github/workflows/ci.yml).
 *
 * fileParallelism: false — every test file already gets its OWN fresh
 * module graph regardless (Vitest's default `isolate: true`, left as-is
 * below), and that per-file isolation is what actually matters for
 * correctness here: it gives each file its own middleware/rateLimit.ts
 * counters (several auth routes are rate-limited per-IP with a fairly low
 * ceiling — see that file's own comments — and supertest's requests all
 * come from the same loopback address, so sharing that counter Map across
 * files could make one file's tests fail depending on run order) and its
 * own db/prisma.ts PrismaClient. Running the *files themselves* one at a
 * time on top of that isolation is a separate, deliberate choice: it keeps
 * one file's PrismaClient connection pool closed (via its own afterAll)
 * before the next file's opens, instead of several pools hitting one
 * Postgres instance at once.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
});
