-- CreateEnum
CREATE TYPE "GuardianReviewStatus" AS ENUM ('pending', 'approved');

-- AlterEnum
ALTER TYPE "QuoteRequestStatus" ADD VALUE 'consumed';

-- AlterTable
ALTER TABLE "onboarding_profiles" ADD COLUMN     "healthDataSkippedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "quoteRequestId" TEXT;

-- AlterTable
ALTER TABLE "quote_requests" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "consumedPaymentId" TEXT;

-- CreateTable
CREATE TABLE "guardian_reviews" (
    "userId" TEXT NOT NULL,
    "guardianName" TEXT NOT NULL,
    "guardianEmail" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "status" "GuardianReviewStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_reviews_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "payments_quoteRequestId_idx" ON "payments"("quoteRequestId");

-- AddForeignKey
ALTER TABLE "guardian_reviews" ADD CONSTRAINT "guardian_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

