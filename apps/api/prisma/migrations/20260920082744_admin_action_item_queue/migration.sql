-- CreateEnum
CREATE TYPE "AdminActionItemType" AS ENUM ('entitlement_activation_failed', 'professional_acceptance_stalled', 'relationship_activation_failed', 'credential_expiring', 'payout_failed', 'refund_impact', 'chargeback', 'safety_escalation', 'privacy_request', 'professional_complaint', 'partner_abuse_review', 'access_revocation_failed', 'support_ticket_open', 'support_escalation', 'relationship_change_pending', 'credential_verification_pending');

-- CreateEnum
CREATE TYPE "AdminActionItemSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "AdminActionItemStatus" AS ENUM ('open', 'resolved');

-- CreateTable
CREATE TABLE "admin_action_items" (
    "id" TEXT NOT NULL,
    "type" "AdminActionItemType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "severity" "AdminActionItemSeverity" NOT NULL DEFAULT 'medium',
    "status" "AdminActionItemStatus" NOT NULL DEFAULT 'open',
    "metadata" JSONB,
    "assignedToAdminId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_action_items_status_severity_idx" ON "admin_action_items"("status", "severity");

-- CreateIndex
CREATE INDEX "admin_action_items_type_idx" ON "admin_action_items"("type");

-- CreateIndex
CREATE INDEX "admin_action_items_entityType_entityId_idx" ON "admin_action_items"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "admin_action_items_assignedToAdminId_idx" ON "admin_action_items"("assignedToAdminId");

-- AddForeignKey
ALTER TABLE "admin_action_items" ADD CONSTRAINT "admin_action_items_assignedToAdminId_fkey" FOREIGN KEY ("assignedToAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_action_items" ADD CONSTRAINT "admin_action_items_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
