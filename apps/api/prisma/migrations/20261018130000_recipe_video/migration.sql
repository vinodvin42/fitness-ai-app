-- Recipe video (18 Oct 2026, owner-approved): one nullable JSON value per
-- recipe, { url, durationSec, steps: [{ step, startSec }] }, validated by the
-- API (adminPrograms.schema.ts). Additive only: existing recipes get NULL,
-- which the app treats as "no video" and shows exactly as before.

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "video" JSONB;
