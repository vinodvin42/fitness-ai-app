import { prisma } from "../src/db/prisma";
import { encryptStringList } from "../src/lib/fieldCrypto";

/**
 * One-time backfill for spec §10's "health data stored encrypted".
 *
 * Encrypts every existing `medicalConditions` / `injuries` value into
 * its `*Enc` column and then empties the plaintext array, so a
 * deployment can migrate without downtime: the read path prefers the
 * encrypted column and falls back to plaintext for any row this has not
 * reached yet.
 *
 * Idempotent — a row that already has an encrypted value is skipped, so
 * a partial run can simply be run again.
 *
 * Run with: npm run db:backfill-health-encryption
 *
 * Once this has run in every environment, the two plaintext columns can
 * be dropped in a follow-up migration. Deliberately NOT dropped in the
 * same migration that adds the encrypted ones: a schema change that
 * destroys the only copy of health data before the encrypting code is
 * live is unrecoverable if the deploy is rolled back.
 */
async function main() {
  let profiles = 0;
  let escalations = 0;

  const profileRows = await prisma.onboardingProfile.findMany({
    where: { OR: [{ medicalConditionsEnc: null }, { injuriesEnc: null }] },
    select: { userId: true, medicalConditions: true, injuries: true, medicalConditionsEnc: true, injuriesEnc: true },
  });

  for (const row of profileRows) {
    // Nothing to encrypt and nothing already encrypted — leave it alone
    // rather than writing an empty blob.
    if (row.medicalConditions.length === 0 && row.injuries.length === 0) continue;

    await prisma.onboardingProfile.update({
      where: { userId: row.userId },
      data: {
        medicalConditionsEnc: row.medicalConditionsEnc ?? encryptStringList(row.medicalConditions),
        injuriesEnc: row.injuriesEnc ?? encryptStringList(row.injuries),
        // Emptied, not left behind: the point of the exercise is that a
        // database dump stops carrying readable health data.
        medicalConditions: [],
        injuries: [],
      },
    });
    profiles += 1;
  }

  const escalationRows = await prisma.safetyEscalation.findMany({
    where: { OR: [{ medicalConditionsEnc: null }, { injuriesEnc: null }] },
    select: { id: true, medicalConditions: true, injuries: true, medicalConditionsEnc: true, injuriesEnc: true },
  });

  for (const row of escalationRows) {
    if (row.medicalConditions.length === 0 && row.injuries.length === 0) continue;
    await prisma.safetyEscalation.update({
      where: { id: row.id },
      data: {
        medicalConditionsEnc: row.medicalConditionsEnc ?? encryptStringList(row.medicalConditions),
        injuriesEnc: row.injuriesEnc ?? encryptStringList(row.injuries),
        medicalConditions: [],
        injuries: [],
      },
    });
    escalations += 1;
  }

  console.log(`Encrypted ${profiles} onboarding profile(s) and ${escalations} safety escalation(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
