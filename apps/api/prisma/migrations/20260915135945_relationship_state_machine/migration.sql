-- R1 U6 (15 Sep 2026) — Relationship.status's new default (requested,
-- was active) and the real @@unique([userId, professionalId,
-- serviceType]) constraint coaching.service.ts's claimRelationship() uses
-- as its atomic create-or-reuse claim. See schema.prisma's own comments
-- on RelationshipStatus and the Relationship model for the full reasoning.

-- AlterTable
ALTER TABLE "relationships" ALTER COLUMN "status" SET DEFAULT 'requested';

-- CreateIndex
CREATE UNIQUE INDEX "relationships_userId_professionalId_serviceType_key" ON "relationships"("userId", "professionalId", "serviceType");
