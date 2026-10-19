-- 08.03 Complaints, 18 Oct 2026. A complaint is a support ticket with the new
-- 'complaint' category; closing it records an outcome and a resolution note.
-- Additive only: one new enum, one new enum value, five nullable columns on
-- support_tickets, an index and a foreign key. ALTER TYPE ... ADD VALUE is safe
-- on PostgreSQL 12+ even inside a transaction, as nothing in this file uses it.
-- Generated with prisma migrate diff from the schema.

-- CreateEnum
CREATE TYPE "ComplaintOutcome" AS ENUM ('upheld', 'partly_upheld', 'not_upheld');

-- AlterEnum
ALTER TYPE "SupportTicketCategory" ADD VALUE 'complaint';

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "complaintClosedAt" TIMESTAMP(3),
ADD COLUMN     "complaintClosedByAdminId" TEXT,
ADD COLUMN     "complaintDueAt" TIMESTAMP(3),
ADD COLUMN     "complaintOutcome" "ComplaintOutcome",
ADD COLUMN     "complaintResolutionNote" TEXT;

-- CreateIndex
CREATE INDEX "support_tickets_category_status_idx" ON "support_tickets"("category", "status");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_complaintClosedByAdminId_fkey" FOREIGN KEY ("complaintClosedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

