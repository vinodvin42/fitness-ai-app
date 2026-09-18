-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('marketing_emails', 'data_analytics', 'health_data_processing');

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_escalations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medicalConditions" TEXT[],
    "injuries" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,

    CONSTRAINT "safety_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consents_userId_type_key" ON "consents"("userId", "type");

-- CreateIndex
CREATE INDEX "safety_escalations_userId_idx" ON "safety_escalations"("userId");

-- CreateIndex
CREATE INDEX "safety_escalations_reviewedAt_idx" ON "safety_escalations"("reviewedAt");

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_escalations" ADD CONSTRAINT "safety_escalations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_escalations" ADD CONSTRAINT "safety_escalations_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

