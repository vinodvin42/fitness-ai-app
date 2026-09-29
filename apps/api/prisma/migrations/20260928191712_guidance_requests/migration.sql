-- CreateEnum
CREATE TYPE "GuidanceRequestStatus" AS ENUM ('open', 'offered', 'fulfilled', 'cancelled', 'exhausted');

-- CreateTable
CREATE TABLE "guidance_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceType" "ProfessionalServiceType" NOT NULL,
    "status" "GuidanceRequestStatus" NOT NULL DEFAULT 'open',
    "userNote" TEXT,
    "rematchCount" INTEGER NOT NULL DEFAULT 0,
    "offerId" TEXT,
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "guidance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guidance_requests_status_createdAt_idx" ON "guidance_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "guidance_requests_userId_idx" ON "guidance_requests"("userId");

-- AddForeignKey
ALTER TABLE "guidance_requests" ADD CONSTRAINT "guidance_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
