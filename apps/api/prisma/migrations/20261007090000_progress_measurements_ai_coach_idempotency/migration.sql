-- AlterTable
ALTER TABLE "body_measurements" ADD COLUMN     "bicepLeftCm" DOUBLE PRECISION,
ADD COLUMN     "bicepRightCm" DOUBLE PRECISION,
ADD COLUMN     "calfLeftCm" DOUBLE PRECISION,
ADD COLUMN     "calfRightCm" DOUBLE PRECISION,
ADD COLUMN     "deviceName" TEXT,
ADD COLUMN     "forearmLeftCm" DOUBLE PRECISION,
ADD COLUMN     "forearmRightCm" DOUBLE PRECISION,
ADD COLUMN     "neckCm" DOUBLE PRECISION,
ADD COLUMN     "shouldersCm" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "thighLeftCm" DOUBLE PRECISION,
ADD COLUMN     "thighRightCm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ai_coach_messages" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "failed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sources" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "ai_coach_messages_userId_clientId_key" ON "ai_coach_messages"("userId", "clientId");

