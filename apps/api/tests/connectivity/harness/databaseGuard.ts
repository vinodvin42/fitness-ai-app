/**
 * Connectivity harness — database-side guard (16 Oct 2026).
 *
 * isolation.ts checks the URL. This checks the database the connection
 * actually reached:
 *   - its name is fynrox_<name>_test, and
 *   - it carries the harness marker table, which prepareDatabase.ts only
 *     ever creates in a database that was EMPTY when the harness first
 *     saw it. A real database (Azure, a dev database, anything with data)
 *     never has the marker, so the journeys refuse to write to it.
 */
import type { PrismaClient } from "@prisma/client";
import { TEST_DATABASE_NAME } from "./isolation";

/**
 * Kept in its own schema, not `public`: `prisma migrate deploy` refuses
 * (P3005) a non-empty `public` schema with no migration history, so a
 * marker in `public` would block the first migration.
 */
export const MARKER_SCHEMA = "fynrox_connectivity_harness";
export const MARKER_TABLE = `${MARKER_SCHEMA}.marker`;

export interface DatabaseInspection {
  database: string;
  hasMarker: boolean;
  /** Tables in the public schema (where the app's tables live). */
  otherTableCount: number;
}

export async function inspectDatabase(client: PrismaClient): Promise<DatabaseInspection> {
  const [{ db }] = await client.$queryRawUnsafe<Array<{ db: string }>>("SELECT current_database() AS db");
  const [{ count }] = await client.$queryRawUnsafe<Array<{ count: number }>>(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  const marker = await client.$queryRawUnsafe<Array<{ found: number }>>(
    "SELECT 1 AS found FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'marker'",
    MARKER_SCHEMA,
  );
  return { database: db, hasMarker: marker.length > 0, otherTableCount: count };
}

export async function assertHarnessDatabase(client: PrismaClient): Promise<DatabaseInspection> {
  const info = await inspectDatabase(client);
  if (!TEST_DATABASE_NAME.test(info.database)) {
    throw new Error(`Connectivity harness refused: connected database "${info.database}" is not a fynrox_*_test database.`);
  }
  if (!info.hasMarker) {
    throw new Error(
      `Connectivity harness refused: database "${info.database}" has no ${MARKER_TABLE} table. ` +
        "Only databases prepared by `npm run connectivity:prepare-db` (which requires an empty database) are used.",
    );
  }
  return info;
}

export async function createMarker(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${MARKER_SCHEMA}`);
  await client.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (claimed_at timestamptz NOT NULL DEFAULT now(), note text NOT NULL)`,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO ${MARKER_TABLE} (note) VALUES ('Disposable connectivity-harness database. Synthetic TEST-ONLY data only.')`,
  );
}
