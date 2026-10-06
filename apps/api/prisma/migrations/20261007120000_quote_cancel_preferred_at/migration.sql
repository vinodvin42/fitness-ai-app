-- AlterEnum
ALTER TYPE "QuoteRequestStatus" ADD VALUE 'cancelled';

-- AlterTable
ALTER TABLE "quote_requests" ADD COLUMN     "preferredAt" TIMESTAMP(3);

