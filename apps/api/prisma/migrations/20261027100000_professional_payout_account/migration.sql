-- Coach payout details (27 Oct 2026, owner decision): a coach enters a bank account or a UPI ID in
-- the coach app; it is stored encrypted (AES-256-GCM, PAYOUT_DETAILS_ENCRYPTION_KEY), shown masked,
-- and an admin verifies it before payouts use it. Additive: two new enums and one new table.

-- CreateEnum
CREATE TYPE "PayoutAccountMethod" AS ENUM ('bank', 'upi');

-- CreateEnum
CREATE TYPE "PayoutAccountStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateTable
CREATE TABLE "professional_payout_accounts" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "method" "PayoutAccountMethod" NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumberEncrypted" TEXT,
    "ifscEncrypted" TEXT,
    "upiIdEncrypted" TEXT,
    "last4" TEXT,
    "maskedDisplay" TEXT NOT NULL,
    "status" "PayoutAccountStatus" NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professional_payout_accounts_professionalId_key" ON "professional_payout_accounts"("professionalId");

-- CreateIndex
CREATE INDEX "professional_payout_accounts_status_idx" ON "professional_payout_accounts"("status");

-- AddForeignKey
ALTER TABLE "professional_payout_accounts" ADD CONSTRAINT "professional_payout_accounts_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
