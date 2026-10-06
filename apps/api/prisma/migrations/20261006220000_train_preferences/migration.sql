-- AlterTable
ALTER TABLE "workout_settings" ADD COLUMN     "audioCoaching" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoDeloadWeek" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preferredDurationMinutes" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "trainingDays" TEXT[] DEFAULT ARRAY[]::TEXT[];

