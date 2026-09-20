-- AlterTable
-- Add as nullable first so this is safe against a non-empty `relationships`
-- table (see this migration's own reasoning in schema.prisma's Relationship.
-- updatedAt doc comment) — backfill existing rows from their own createdAt
-- (the closest honest approximation for rows that predate this column: we
-- don't know their real last-transition time, but "at least as recent as
-- creation" is true for every row), then tighten to NOT NULL once backfilled.
ALTER TABLE "relationships" ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "relationships" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "relationships" ALTER COLUMN "updatedAt" SET NOT NULL;
