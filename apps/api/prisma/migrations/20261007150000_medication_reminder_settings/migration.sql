-- AlterTable
ALTER TABLE "medications" ADD COLUMN     "detailedPreview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mealTiming" TEXT,
ADD COLUMN     "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "repeatMode" TEXT NOT NULL DEFAULT 'daily',
ADD COLUMN     "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vibrationEnabled" BOOLEAN NOT NULL DEFAULT false;

