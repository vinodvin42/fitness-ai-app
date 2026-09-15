-- CreateEnum
CREATE TYPE "FoodEstimateStatus" AS ENUM ('estimated', 'insufficient_context', 'confirmed', 'edited');

-- AlterEnum
ALTER TYPE "MealLogSource" ADD VALUE 'ai_estimate';

-- CreateTable
CREATE TABLE "food_estimates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mealType" "MealType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "FoodEstimateStatus" NOT NULL,
    "name" TEXT,
    "calories" INTEGER,
    "proteinG" INTEGER,
    "carbsG" INTEGER,
    "fatG" INTEGER,
    "failureReason" TEXT,
    "mealLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "food_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_estimates_mealLogId_key" ON "food_estimates"("mealLogId");

-- CreateIndex
CREATE INDEX "food_estimates_userId_createdAt_idx" ON "food_estimates"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "food_estimates" ADD CONSTRAINT "food_estimates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_estimates" ADD CONSTRAINT "food_estimates_mealLogId_fkey" FOREIGN KEY ("mealLogId") REFERENCES "meal_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
