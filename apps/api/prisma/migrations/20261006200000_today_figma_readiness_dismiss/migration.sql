-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'nutrition';

-- AlterTable
ALTER TABLE "onboarding_profiles" ADD COLUMN     "targetWeightKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "dismissedAt" TIMESTAMP(3);

