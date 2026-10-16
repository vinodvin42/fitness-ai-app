/**
 * Vitest globalSetup for the connectivity journeys (runs once, before any
 * journey file). Re-checks isolation, re-checks the database marker, then
 * seeds a fresh synthetic world for this run and writes it to
 * test-results/connectivity/world.json. Clears the previous evidence log.
 */
import fs from "node:fs";
import path from "node:path";
import { assertIsolatedEnvironment } from "./isolation";
import { EVIDENCE_FILE, RESULTS_DIR } from "./evidence";

export default async function setup(): Promise<void> {
  process.env.DOTENV_CONFIG_PATH = path.join(__dirname, "__no_dotenv_for_connectivity_harness__");
  assertIsolatedEnvironment(process.env);

  // Imported only after the checks above, because these load config/env.ts.
  const { PrismaClient } = await import("@prisma/client");
  const { assertHarnessDatabase } = await import("./databaseGuard");
  const { seedSyntheticWorld, writeWorld } = await import("./syntheticWorld");
  const { hashPassword } = await import("../../../src/lib/password");
  const { generateUniqueReferralCode } = await import("../../../src/lib/referralCode");
  const { prisma: appPrisma } = await import("../../../src/db/prisma");

  const client = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    await assertHarnessDatabase(client);
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    if (fs.existsSync(EVIDENCE_FILE)) fs.rmSync(EVIDENCE_FILE);
    const world = await seedSyntheticWorld(client, { hashPassword, generateUniqueReferralCode });
    writeWorld(world);
    console.log(`[connectivity] synthetic world ${world.runId} seeded (TEST-ONLY data)`);
  } finally {
    await client.$disconnect();
    await appPrisma.$disconnect();
  }
}
