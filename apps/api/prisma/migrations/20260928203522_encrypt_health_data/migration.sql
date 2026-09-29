-- AlterTable
ALTER TABLE "onboarding_profiles" ADD COLUMN     "injuriesEnc" TEXT,
ADD COLUMN     "medicalConditionsEnc" TEXT;

-- AlterTable
ALTER TABLE "safety_escalations" ADD COLUMN     "injuriesEnc" TEXT,
ADD COLUMN     "medicalConditionsEnc" TEXT;
