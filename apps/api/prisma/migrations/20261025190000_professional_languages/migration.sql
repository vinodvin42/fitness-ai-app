-- Professional languages (25 Oct 2026): the languages a professional speaks, chosen in the coach app and
-- shown to members on the profile and as a Find a professional filter. Additive: one column, empty by
-- default (= not stated). ISO 639-1 codes, see apps/api/src/lib/coachLanguages.ts.

-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
