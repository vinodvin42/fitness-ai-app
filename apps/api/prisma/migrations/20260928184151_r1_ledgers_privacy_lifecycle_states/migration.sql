-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('pending_calculation', 'eligible', 'approved', 'paid', 'disputed', 'reversed');

-- CreateEnum
CREATE TYPE "PayoutBatchKind" AS ENUM ('professional_earning', 'creator_commission');

-- CreateEnum
CREATE TYPE "PayoutBatchStatus" AS ENUM ('draft', 'processing', 'completed', 'partially_failed');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('received', 'verifying', 'in_progress', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "PrivacyRequestType" AS ENUM ('export', 'deletion');

-- CreateEnum
CREATE TYPE "EquipmentProfileStatus" AS ENUM ('current', 'stale');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GymStatus" ADD VALUE 'more_info';
ALTER TYPE "GymStatus" ADD VALUE 'rejected';
ALTER TYPE "GymStatus" ADD VALUE 'ended';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InfluencerStatus" ADD VALUE 'draft';
ALTER TYPE "InfluencerStatus" ADD VALUE 'pending_review';
ALTER TYPE "InfluencerStatus" ADD VALUE 'more_info';
ALTER TYPE "InfluencerStatus" ADD VALUE 'rejected';
ALTER TYPE "InfluencerStatus" ADD VALUE 'suspended';
ALTER TYPE "InfluencerStatus" ADD VALUE 'ended';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PayoutStatus" ADD VALUE 'eligible';
ALTER TYPE "PayoutStatus" ADD VALUE 'approved';
ALTER TYPE "PayoutStatus" ADD VALUE 'payout_failed';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProfessionalLifecycleStatus" ADD VALUE 'needs_action';
ALTER TYPE "ProfessionalLifecycleStatus" ADD VALUE 'rejected';
ALTER TYPE "ProfessionalLifecycleStatus" ADD VALUE 'restricted';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RelationshipStatus" ADD VALUE 'offered';
ALTER TYPE "RelationshipStatus" ADD VALUE 'declined';
ALTER TYPE "RelationshipStatus" ADD VALUE 'expired';
ALTER TYPE "RelationshipStatus" ADD VALUE 'activation_failed';
ALTER TYPE "RelationshipStatus" ADD VALUE 'changing';
ALTER TYPE "RelationshipStatus" ADD VALUE 'completed';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "ruleId" TEXT,
ADD COLUMN     "stateAfter" JSONB,
ADD COLUMN     "stateBefore" JSONB;

-- AlterTable
ALTER TABLE "coach_settlements" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "payoutBatchId" TEXT,
ADD COLUMN     "payoutFailureReason" TEXT;

-- AlterTable
ALTER TABLE "gym_locations" ADD COLUMN     "equipmentConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "equipmentStatus" "EquipmentProfileStatus" NOT NULL DEFAULT 'current';

-- AlterTable
ALTER TABLE "influencer_payouts" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "payoutFailureReason" TEXT;

-- CreateTable
CREATE TABLE "creator_commissions" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "campaignId" TEXT,
    "commissionPct" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'pending_calculation',
    "disputedReason" TEXT,
    "refundId" TEXT,
    "payoutBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "creator_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_batches" (
    "id" TEXT NOT NULL,
    "kind" "PayoutBatchKind" NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "status" "PayoutBatchStatus" NOT NULL DEFAULT 'draft',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PrivacyRequestType" NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'received',
    "userNote" TEXT,
    "verifiedByAdminId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "exportUrl" TEXT,
    "exportExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_commissions_paymentId_key" ON "creator_commissions"("paymentId");

-- CreateIndex
CREATE INDEX "creator_commissions_influencerId_status_idx" ON "creator_commissions"("influencerId", "status");

-- CreateIndex
CREATE INDEX "creator_commissions_status_idx" ON "creator_commissions"("status");

-- CreateIndex
CREATE INDEX "payout_batches_kind_status_idx" ON "payout_batches"("kind", "status");

-- CreateIndex
CREATE INDEX "privacy_requests_userId_status_idx" ON "privacy_requests"("userId", "status");

-- CreateIndex
CREATE INDEX "privacy_requests_status_createdAt_idx" ON "privacy_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "coach_settlements" ADD CONSTRAINT "coach_settlements_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_commissions" ADD CONSTRAINT "creator_commissions_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_commissions" ADD CONSTRAINT "creator_commissions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_commissions" ADD CONSTRAINT "creator_commissions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_commissions" ADD CONSTRAINT "creator_commissions_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_verifiedByAdminId_fkey" FOREIGN KEY ("verifiedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
