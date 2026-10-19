-- Exercise video (18 Oct 2026, owner-approved): one nullable JSON value per
-- exercise, { url, durationSec, credit: { author, licence, licenceUrl?,
-- sourceUrl?, changes? } }, validated by the API (adminPrograms.schema.ts).
-- Additive only: existing exercises get NULL, which the app treats as "no
-- video" and shows the photo(s) exactly as before.

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "video" JSONB;
