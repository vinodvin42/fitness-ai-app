-- AlterTable
ALTER TABLE "recovery_logs" ADD COLUMN     "activeCalories" INTEGER,
ADD COLUMN     "activeMinutes" INTEGER,
ADD COLUMN     "spo2" INTEGER,
ADD COLUMN     "steps" INTEGER,
ADD COLUMN     "stressScore" INTEGER;

-- AlterTable
ALTER TABLE "connected_devices" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY['steps', 'heart_rate', 'sleep', 'spo2', 'stress', 'workouts']::TEXT[];

