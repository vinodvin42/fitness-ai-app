-- R2 Wave 1 (20 Sep 2026) — Professional.lifecycleStatus / maxActiveClients.
-- See schema.prisma's own ProfessionalLifecycleStatus doc comment for the
-- full "how this interacts with ProfessionalStatus" reasoning.

-- CreateEnum
CREATE TYPE "ProfessionalLifecycleStatus" AS ENUM ('application', 'verification', 'approved', 'available', 'suspended');

-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "lifecycleStatus" "ProfessionalLifecycleStatus" NOT NULL DEFAULT 'application',
ADD COLUMN     "maxActiveClients" INTEGER NOT NULL DEFAULT 15;

-- Backfill every existing row (the DEFAULT above only governs brand-new
-- rows going forward) from real signals — the professional's own verified-
-- credential state, the same real precondition
-- professionalLifecycle.service.ts#meetsAvailablePrecondition enforces at
-- runtime for `available`:
--   * at least one `verified` ProfessionalCredential -> `available`
--   * zero verified credentials                      -> `approved`
-- This intentionally applies to EVERY existing row, not only
-- `status = 'active'` ones. The work package's own wording only names the
-- `active` case explicitly and says a `suspended` professional "stays
-- functionally suspended regardless of this new field's value" — true,
-- since `Professional.status` (unaffected by this migration) remains the
-- authoritative "can this professional do anything" gate either way. But
-- leaving every suspended row at the column's bare `application` default
-- would misrepresent a suspended coach who'd already cleared review and
-- had a live verified service as someone who'd never even started
-- onboarding — a real, avoidable inaccuracy in a field whose whole job is
-- to describe how far along that professional's own application actually
-- got. Applying the identical credential-based rule to suspended rows too
-- keeps `lifecycleStatus` honest for all of them without inventing any
-- state-conflict: it never claims a suspended professional is (workably)
-- `available`, `Professional.status` alone still decides that.
UPDATE "professionals" AS p
SET "lifecycleStatus" = 'available'
WHERE EXISTS (
  SELECT 1 FROM "professional_credentials" AS pc
  WHERE pc."professionalId" = p."id" AND pc."status" = 'verified'
);

UPDATE "professionals" AS p
SET "lifecycleStatus" = 'approved'
WHERE NOT EXISTS (
  SELECT 1 FROM "professional_credentials" AS pc
  WHERE pc."professionalId" = p."id" AND pc."status" = 'verified'
);
