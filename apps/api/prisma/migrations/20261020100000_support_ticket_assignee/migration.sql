-- 08.01 Support Tickets: who is working a ticket (Oct 2026). Additive only: one
-- nullable column, an index and a foreign key; existing tickets stay unassigned.

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN "assignedAdminId" TEXT;

-- CreateIndex
CREATE INDEX "support_tickets_assignedAdminId_idx" ON "support_tickets"("assignedAdminId");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
