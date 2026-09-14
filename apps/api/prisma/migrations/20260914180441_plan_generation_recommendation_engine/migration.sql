-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('generating', 'generated', 'failed');

-- CreateEnum
CREATE TYPE "RecommendationKind" AS ENUM ('no_change', 'switch_program');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('active', 'accepted', 'modified', 'declined', 'no_change', 'superseded');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'generating',
    "programId" TEXT,
    "rationale" TEXT,
    "failureReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "kind" "RecommendationKind" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'active',
    "rationale" TEXT NOT NULL,
    "suggestedProgramId" TEXT,
    "decidedByRole" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plans_userId_isActive_idx" ON "plans"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "plans_userId_version_key" ON "plans"("userId", "version");

-- CreateIndex
CREATE INDEX "recommendations_userId_status_idx" ON "recommendations"("userId", "status");

-- CreateIndex
CREATE INDEX "recommendations_planId_idx" ON "recommendations"("planId");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_suggestedProgramId_fkey" FOREIGN KEY ("suggestedProgramId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
