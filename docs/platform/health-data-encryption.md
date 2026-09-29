# Health data encryption, and dropping the plaintext columns

Spec §10 requires health data stored encrypted. `medicalConditions` and
`injuries` — on `onboarding_profiles` and on `safety_escalations` — are
encrypted with AES-256-GCM into `*_enc` columns.

The plaintext columns still exist. This page is how they stop existing.

## Why they are still there

The encrypted columns were added alongside the plaintext ones, not
instead of them, on purpose. A schema change that destroys the only copy
of health data before the encrypting code is live in every environment is
**unrecoverable if the deploy is rolled back**. So the read path
(`src/lib/healthData.ts`) prefers the encrypted column and falls back to
plaintext for any row the backfill has not reached, and the two live side
by side until every environment is done.

## The sequence

Per environment, in this order. A pass in staging says nothing about
production; run both steps against each environment's own database.

**1. Backfill.**

```bash
npm run db:backfill-health-encryption --workspace=apps/api
```

Idempotent — a row that already has an encrypted value is skipped, so a
partial run can simply be run again.

**2. Verify.**

```bash
npm run db:verify-health-encryption --workspace=apps/api
```

Exits 0 only when every row holding health data also holds it encrypted.
Otherwise it exits 1 and prints the offending **ids** — never the values,
because this output lands in terminals and CI logs, and the values are
the thing the whole exercise protects.

"Has the backfill run everywhere" is not a question anyone can answer
from memory. This answers it from the data.

**3. Only once step 2 passes in *every* environment**, drop the columns.

## The drop

Deliberately **not** staged as a migration in this repo. An unapplied
destructive migration sitting in `prisma/migrations` is applied by the
next `prisma migrate deploy` anyone runs — which is exactly the accident
the verifier exists to prevent. When the day comes, remove the four
fields from `schema.prisma` and let Prisma generate the migration; it
will be this:

```sql
ALTER TABLE "onboarding_profiles" DROP COLUMN "medicalConditions";
ALTER TABLE "onboarding_profiles" DROP COLUMN "injuries";
ALTER TABLE "safety_escalations"  DROP COLUMN "medicalConditions";
ALTER TABLE "safety_escalations"  DROP COLUMN "injuries";
```

Then delete the plaintext fallback in `src/lib/healthData.ts`. Leaving
the fallback behind after the columns are gone is harmless but
misleading: it reads as though there were still something to fall back
to.

## What the verifier does not check

- **That the key is the right key.** It checks a ciphertext exists, not
  that it decrypts. A row encrypted under a key the environment has since
  lost would pass here and fail at read time. The suite's
  `healthDataEncryption.test.ts` covers round-tripping; this covers
  coverage.
- **Other environments.** It only ever looks at the database it is
  pointed at. There is no central record of which environments have been
  done, and inventing one here would be a worse lie than a checklist.
