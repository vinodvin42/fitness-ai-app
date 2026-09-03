import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";

/**
 * Shared fixtures for the real, Postgres-backed integration tests in this
 * directory. Nothing here mocks Prisma or Express — every test file below
 * imports the real createApp() and talks to a real database.
 *
 * This dev/CI database is never assumed pristine (see each test file's own
 * doc comment) — it may already hold unrelated rows (leftover local dev
 * data, another test file's fixtures). Every helper below produces a
 * uniquely-suffixed value so a test's own fixtures never collide with
 * anything else, and no test in this suite asserts on total row counts —
 * only on the specific rows it created itself.
 */

let counter = 0;

/** A collision-safe suffix for fixture emails/ids/codes within one test run. */
export function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function uniqueEmail(prefix = "test"): string {
  return `${prefix}-${uniqueSuffix()}@example.com`;
}

/**
 * One fresh Express app per test file (each file calls this once, in its
 * own beforeAll) — see vitest.config.ts's own comment for why that's also
 * what keeps rate-limit counters from one file leaking into another.
 */
export function buildApp() {
  return createApp();
}

export { prisma };
