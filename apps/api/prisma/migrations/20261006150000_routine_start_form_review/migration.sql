-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "ownerUserId" TEXT;

-- AlterTable
ALTER TABLE "routines" ADD COLUMN     "workoutId" TEXT;

-- AlterTable
ALTER TABLE "form_analysis_submissions" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByProfessionalId" TEXT;

-- CreateIndex
CREATE INDEX "programs_ownerUserId_idx" ON "programs"("ownerUserId");

-- CreateIndex
CREATE INDEX "form_analysis_submissions_status_createdAt_idx" ON "form_analysis_submissions"("status", "createdAt");

