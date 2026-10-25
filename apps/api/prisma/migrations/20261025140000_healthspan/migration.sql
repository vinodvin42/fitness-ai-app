-- AlterTable
ALTER TABLE "onboarding_profiles" ADD COLUMN     "healthspanEnc" TEXT;

-- CreateTable
CREATE TABLE "health_readings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "vo2max" DOUBLE PRECISION,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_readings_userId_kind_measuredAt_idx" ON "health_readings"("userId", "kind", "measuredAt");

-- AddForeignKey
ALTER TABLE "health_readings" ADD CONSTRAINT "health_readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
