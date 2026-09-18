-- AlterTable
ALTER TABLE "body_measurements" ADD COLUMN     "bodyFatPercent" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "onboarding_profiles" ADD COLUMN     "equipmentContext" TEXT,
ADD COLUMN     "preferredTrainingDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sessionLengthMinutes" INTEGER,
ADD COLUMN     "trainingDaysPerWeek" INTEGER;
