-- AlterEnum
ALTER TYPE "GuardianReviewStatus" ADD VALUE 'declined';

-- AlterTable
ALTER TABLE "onboarding_profiles" ADD COLUMN     "dateOfBirth" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "guardian_reviews" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "lastSentAt" TIMESTAMP(3),
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "tokenHash" TEXT,
ALTER COLUMN "guardianName" DROP NOT NULL,
ALTER COLUMN "relationship" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "guardian_reviews_tokenHash_key" ON "guardian_reviews"("tokenHash");

