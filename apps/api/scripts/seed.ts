/**
 * CLI entry point — run: npm run db:seed --workspace=apps/api
 *
 * The actual seed logic lives in src/lib/seedDatabase.ts (moved there
 * 4 Sep 2026 so it's also callable from a real HTTP route, not just this
 * CLI script — see that file's own doc comment for why). This file is now
 * just a thin wrapper: call it, print the summary, exit.
 */
import { prisma } from "../src/db/prisma";
import { seedDatabase } from "../src/lib/seedDatabase";

seedDatabase()
  .then((summary) => {
    for (const line of summary) console.log(line);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
