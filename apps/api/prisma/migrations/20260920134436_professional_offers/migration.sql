-- CreateEnum
CREATE TYPE "ProfessionalOfferStatus" AS ENUM ('offered', 'accepted', 'declined', 'expired');

-- CreateTable
CREATE TABLE "professional_offers" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceType" "ProfessionalServiceType" NOT NULL,
    "status" "ProfessionalOfferStatus" NOT NULL DEFAULT 'offered',
    "proposedByAdminId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "professional_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professional_offers_professionalId_status_idx" ON "professional_offers"("professionalId", "status");

-- CreateIndex
CREATE INDEX "professional_offers_userId_idx" ON "professional_offers"("userId");

-- AddForeignKey
ALTER TABLE "professional_offers" ADD CONSTRAINT "professional_offers_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_offers" ADD CONSTRAINT "professional_offers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_offers" ADD CONSTRAINT "professional_offers_proposedByAdminId_fkey" FOREIGN KEY ("proposedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
