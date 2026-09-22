-- CreateEnum
CREATE TYPE "MealPlanStatus" AS ENUM ('generating', 'generated', 'failed');

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "MealPlanStatus" NOT NULL DEFAULT 'generating',
    "durationDays" INTEGER NOT NULL DEFAULT 7,
    "rationale" TEXT,
    "failureReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_items" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "mealType" "MealType" NOT NULL,
    "recipeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_plans_userId_isActive_idx" ON "meal_plans"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_userId_version_key" ON "meal_plans"("userId", "version");

-- CreateIndex
CREATE INDEX "meal_plan_items_mealPlanId_dayNumber_idx" ON "meal_plan_items"("mealPlanId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_items_mealPlanId_dayNumber_mealType_key" ON "meal_plan_items"("mealPlanId", "dayNumber", "mealType");

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_items" ADD CONSTRAINT "meal_plan_items_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_items" ADD CONSTRAINT "meal_plan_items_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
