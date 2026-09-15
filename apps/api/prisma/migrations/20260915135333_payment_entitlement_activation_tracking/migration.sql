-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "activationFailedAt" TIMESTAMP(3),
ADD COLUMN     "activationFailureReason" TEXT;
