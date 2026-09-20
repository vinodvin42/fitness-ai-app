-- AlterTable
ALTER TABLE "professional_offers" ADD COLUMN     "proposedByProfessionalId" TEXT;

-- AddForeignKey
ALTER TABLE "professional_offers" ADD CONSTRAINT "professional_offers_proposedByProfessionalId_fkey" FOREIGN KEY ("proposedByProfessionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
