-- Professional profile photo (25 Oct 2026): the coach's own picture, set in the coach app and shown to
-- members on the professional's profile. Additive only: one new table, one row per professional,
-- deleted with the account. See the ProfessionalProfilePhoto model in schema.prisma.

-- CreateTable
CREATE TABLE "professional_profile_photos" (
    "professionalId" TEXT NOT NULL,
    "imageData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_profile_photos_pkey" PRIMARY KEY ("professionalId")
);

-- AddForeignKey
ALTER TABLE "professional_profile_photos" ADD CONSTRAINT "professional_profile_photos_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
