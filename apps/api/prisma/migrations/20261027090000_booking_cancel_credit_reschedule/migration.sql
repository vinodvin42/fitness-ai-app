-- Booking changes (27 Oct 2026, owner policy): a member can cancel a session any time before it starts
-- and gets a session credit (no cash refund); a coach can propose a new time, which the member
-- accepts or declines for a credit. Additive: new nullable booking columns, a new enum and table.

-- CreateEnum
CREATE TYPE "SessionCreditReason" AS ENUM ('member_cancelled', 'reschedule_declined');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "paidWithCreditId" TEXT,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "proposedAt" TIMESTAMP(3),
ADD COLUMN     "proposedScheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "session_credits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" "SessionCreditReason" NOT NULL,
    "sourceBookingId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_credits_sourceBookingId_key" ON "session_credits"("sourceBookingId");

-- CreateIndex
CREATE INDEX "session_credits_userId_usedAt_idx" ON "session_credits"("userId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_paidWithCreditId_key" ON "bookings"("paidWithCreditId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_paidWithCreditId_fkey" FOREIGN KEY ("paidWithCreditId") REFERENCES "session_credits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_sourceBookingId_fkey" FOREIGN KEY ("sourceBookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

