-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'booking';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "scheduledAt" TIMESTAMP(3);
