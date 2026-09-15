-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
--
-- R1 U6 (15 Sep 2026) — extends RelationshipStatus from active/ended to
-- the real six-stage lifecycle described on that enum in schema.prisma.
-- Split into its own migration (separate from the DEFAULT/unique-index
-- migration that follows) because Postgres will not let a newly-added
-- enum value be referenced by another statement in the same transaction
-- it was added in.

ALTER TYPE "RelationshipStatus" ADD VALUE 'requested';
ALTER TYPE "RelationshipStatus" ADD VALUE 'accepted';
ALTER TYPE "RelationshipStatus" ADD VALUE 'awaiting_payment';
ALTER TYPE "RelationshipStatus" ADD VALUE 'activating';
