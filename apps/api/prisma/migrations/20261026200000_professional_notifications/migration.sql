-- Coach inbox (26 Oct 2026): one row per event a coach should hear about (a request, an offer, a
-- booking, a verification decision, a payout). Additive: a new enum and a new table, nothing existing
-- changes. See ProfessionalNotification in schema.prisma.

-- CreateEnum
CREATE TYPE "ProfessionalNotificationKind" AS ENUM ('request', 'offer', 'booking', 'message', 'relationship', 'verification', 'payout', 'system');

-- CreateTable
CREATE TABLE "professional_notifications" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "kind" "ProfessionalNotificationKind" NOT NULL DEFAULT 'system',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professional_notifications_professionalId_createdAt_idx" ON "professional_notifications"("professionalId", "createdAt");

-- CreateIndex
CREATE INDEX "professional_notifications_professionalId_readAt_idx" ON "professional_notifications"("professionalId", "readAt");

-- AddForeignKey
ALTER TABLE "professional_notifications" ADD CONSTRAINT "professional_notifications_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

