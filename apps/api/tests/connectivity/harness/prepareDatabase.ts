/**
 * Connectivity harness — prepare the disposable database (16 Oct 2026).
 *
 *   npm run connectivity:prepare-db --workspace=apps/api
 *
 * 1. Refuses unless the environment passes isolation.ts (local host,
 *    fynrox_*_test name, test-only secrets, side effects off).
 * 2. Claims the database with the harness marker table — but ONLY if the
 *    database is empty. A database that already has tables and no marker
 *    is refused: it was not created for the harness.
 * 3. Applies the repository's migrations to that disposable database with
 *    `prisma migrate deploy`. This never touches any other database: the
 *    URL has already been checked, and the marker re-checked afterwards.
 *
 * Does not seed anything; globalSetup.ts seeds synthetic accounts.
 * Prints the database name only — never the URL or credentials.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertIsolatedEnvironment, parseDatabaseUrl } from "./isolation";
import { assertHarnessDatabase, createMarker, inspectDatabase } from "./databaseGuard";

async function main() {
  assertIsolatedEnvironment(process.env);
  const target = parseDatabaseUrl(process.env.DATABASE_URL)!;
  console.log(`[connectivity] target database: ${target.database} on ${target.host}:${target.port}`);

  const client = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const before = await inspectDatabase(client);
    if (!before.hasMarker) {
      if (before.otherTableCount > 0) {
        throw new Error(
          `Refusing: "${before.database}" already has ${before.otherTableCount} table(s) and no harness marker. ` +
            "It was not created for this harness. Start a fresh disposable PostgreSQL instead.",
        );
      }
      await createMarker(client);
      console.log("[connectivity] empty database claimed with the harness marker");
    } else {
      console.log("[connectivity] harness marker already present");
    }
  } finally {
    await client.$disconnect();
  }

  const apiRoot = path.resolve(__dirname, "..", "..", "..");
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: apiRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32", // npx is npx.cmd on Windows
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy exited with ${result.status ?? result.signal}`);
  }

  const verify = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const after = await assertHarnessDatabase(verify);
    console.log(`[connectivity] ready: ${after.database}, ${after.otherTableCount} tables, marker present`);
  } finally {
    await verify.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
