import { prisma } from "../src/db/prisma";

/**
 * Gate for dropping the plaintext health columns.
 *
 * `backfillHealthEncryption.ts` copies every `medicalConditions` /
 * `injuries` value into its `*Enc` column. The plaintext columns stay
 * until that has run in EVERY environment, because a schema change that
 * destroys the only copy of health data before the encrypting code is
 * live is unrecoverable if the deploy is rolled back.
 *
 * "Has it run everywhere" is not a question anyone can answer from
 * memory, so this answers it from the data, per environment:
 *
 *   npm run db:verify-health-encryption
 *
 * Exits 0 when every row that has health data also has it encrypted, and
 * non-zero with the offending ids otherwise. Run it against each
 * environment's own database; a pass in staging says nothing about
 * production.
 *
 * The drop itself is deliberately NOT staged as a migration in this
 * repo. An unapplied destructive migration sitting in `prisma/migrations`
 * is applied by the next `prisma migrate deploy` anyone runs, which is
 * precisely the accident this gate exists to prevent. The exact SQL is
 * in docs/platform/health-data-encryption.md, as text.
 */
async function main() {
  // A row is unsafe when it still holds plaintext that was never
  // encrypted. A row with neither is fine; a row with both is fine (the
  // backfill empties plaintext, but an older partial run may not have).
  const profiles = await prisma.onboardingProfile.findMany({
    where: {
      OR: [
        { AND: [{ NOT: { medicalConditions: { isEmpty: true } } }, { medicalConditionsEnc: null }] },
        { AND: [{ NOT: { injuries: { isEmpty: true } } }, { injuriesEnc: null }] },
      ],
    },
    select: { userId: true },
  });

  const escalations = await prisma.safetyEscalation.findMany({
    where: {
      OR: [
        { AND: [{ NOT: { medicalConditions: { isEmpty: true } } }, { medicalConditionsEnc: null }] },
        { AND: [{ NOT: { injuries: { isEmpty: true } } }, { injuriesEnc: null }] },
      ],
    },
    select: { id: true },
  });

  const totalProfiles = await prisma.onboardingProfile.count();
  const totalEscalations = await prisma.safetyEscalation.count();

  console.log(`onboarding_profiles:  ${totalProfiles} rows, ${profiles.length} not yet encrypted`);
  console.log(`safety_escalations:   ${totalEscalations} rows, ${escalations.length} not yet encrypted`);

  if (profiles.length === 0 && escalations.length === 0) {
    console.log("\nSAFE TO DROP in THIS environment.");
    console.log("Run this against every other environment before dropping anywhere.");
    await prisma.$disconnect();
    return;
  }

  // Ids, not values: this prints to a terminal and into CI logs, and the
  // values are the health data the whole exercise exists to protect.
  console.log("\nNOT SAFE TO DROP. Run `npm run db:backfill-health-encryption` first.");
  if (profiles.length) console.log("  onboarding_profiles userIds:", profiles.slice(0, 20).map((p) => p.userId));
  if (escalations.length) console.log("  safety_escalations ids:", escalations.slice(0, 20).map((e) => e.id));
  await prisma.$disconnect();
  process.exit(1);
}

void main();
