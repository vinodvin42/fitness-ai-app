-- AlterTable
ALTER TABLE "recovery_logs" ADD COLUMN     "sleepAwakeMin" INTEGER,
ADD COLUMN     "sleepDeepMin" INTEGER,
ADD COLUMN     "sleepEnd" TIMESTAMP(3),
ADD COLUMN     "sleepInBedMin" INTEGER,
ADD COLUMN     "sleepLightMin" INTEGER,
ADD COLUMN     "sleepRemMin" INTEGER,
ADD COLUMN     "sleepStart" TIMESTAMP(3);
