-- FynroX is for adults 18+ only (owner decision, Oct 2026).
-- The under-18 guardian review flow is removed entirely.

-- DropForeignKey
ALTER TABLE "guardian_reviews" DROP CONSTRAINT "guardian_reviews_userId_fkey";

-- DropTable
DROP TABLE "guardian_reviews";

-- DropEnum
DROP TYPE "GuardianReviewStatus";
