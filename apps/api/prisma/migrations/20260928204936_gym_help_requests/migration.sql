-- CreateEnum
CREATE TYPE "GymHelpCategory" AS ENUM ('trainer_support', 'equipment', 'member_onboarding', 'billing', 'other');

-- CreateEnum
CREATE TYPE "GymHelpRequestStatus" AS ENUM ('open', 'in_progress', 'resolved');

-- CreateTable
CREATE TABLE "gym_help_requests" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "locationId" TEXT,
    "category" "GymHelpCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "gymReference" TEXT,
    "status" "GymHelpRequestStatus" NOT NULL DEFAULT 'open',
    "resolutionNote" TEXT,
    "resolvedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "gym_help_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gym_help_requests_gymId_status_idx" ON "gym_help_requests"("gymId", "status");

-- CreateIndex
CREATE INDEX "gym_help_requests_status_createdAt_idx" ON "gym_help_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "gym_help_requests" ADD CONSTRAINT "gym_help_requests_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_help_requests" ADD CONSTRAINT "gym_help_requests_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "gym_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_help_requests" ADD CONSTRAINT "gym_help_requests_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
