-- AlterTable
ALTER TABLE "creator_commissions" ADD COLUMN     "lastPayoutFailedAt" TIMESTAMP(3),
ADD COLUMN     "lastPayoutFailureReason" TEXT;
