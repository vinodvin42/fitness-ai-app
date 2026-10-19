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

/**
 * Package 4 — coach prices come from a level fee, not the offering. Places
 * the coach in a fresh test level with one fee for one fresh service and
 * gives them a matching offering. Call `cleanup()` after the test has
 * deleted its bookings and offerings.
 */
export async function createPricedOffering(
  professionalId: string,
  opts: { serviceType: "fitness" | "nutrition" | null; feeCents: number; durationMinutes?: number; label?: string },
) {
  const suffix = uniqueSuffix();
  const label = opts.label ?? "Test Session";
  const durationMinutes = opts.durationMinutes ?? 60;
  const level = await prisma.coachLevel.create({
    data: { name: `Test level ${suffix}`, rank: 100_000 + Math.floor(Math.random() * 1_000_000_000) },
  });
  const service = await prisma.coachService.create({
    data: { key: `test-${suffix}`, label, serviceType: opts.serviceType, durationMinutes },
  });
  await prisma.coachLevelFee.create({
    data: {
      levelId: level.id,
      serviceId: service.id,
      priceCents: opts.feeCents,
      effectiveFrom: new Date(Date.now() - 60_000),
      reason: "test fixture",
    },
  });
  await prisma.professional.update({ where: { id: professionalId }, data: { coachLevelId: level.id } });
  const offering = await prisma.professionalServiceOffering.create({
    data: { professionalId, serviceId: service.id, serviceType: opts.serviceType, label, durationMinutes, isActive: true },
  });
  return {
    offering,
    levelId: level.id,
    serviceId: service.id,
    async cleanup() {
      await prisma.professionalServiceOffering.deleteMany({ where: { serviceId: service.id } });
      await prisma.coachService.deleteMany({ where: { id: service.id } });
      await prisma.coachLevel.deleteMany({ where: { id: level.id } });
    },
  };
}
