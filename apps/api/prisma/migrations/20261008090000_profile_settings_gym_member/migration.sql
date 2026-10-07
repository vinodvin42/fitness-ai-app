-- CreateEnum
CREATE TYPE "UserDataExportStatus" AS ENUM ('ready', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "HelpArticleCategory" AS ENUM ('getting_started', 'workouts', 'nutrition', 'billing', 'professionals');

-- CreateEnum
CREATE TYPE "GymTimingKind" AS ENUM ('regular', 'women_only', 'special');

-- CreateEnum
CREATE TYPE "GymAnnouncementKind" AS ENUM ('holiday', 'notice');

-- CreateEnum
CREATE TYPE "GymHelpTopic" AS ENUM ('form_check', 'machine_help', 'trainer_available', 'other');

-- CreateEnum
CREATE TYPE "GymHelpStatus" AS ENUM ('open', 'seen', 'resolved');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "unitPreferences" JSONB;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "gyms" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "frequencyCap" INTEGER,
ADD COLUMN     "hydrationReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "masterEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "saved_recipes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_partner_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_partner_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_data_sharing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "steps" BOOLEAN NOT NULL DEFAULT false,
    "foodLogs" BOOLEAN NOT NULL DEFAULT true,
    "sleepRecovery" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_data_sharing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_data_exports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "UserDataExportStatus" NOT NULL DEFAULT 'ready',
    "files" JSONB NOT NULL,
    "zipSize" INTEGER NOT NULL DEFAULT 0,
    "bytes" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_data_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "HelpArticleCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_timings" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "locationId" TEXT,
    "label" TEXT NOT NULL,
    "days" TEXT NOT NULL,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "kind" "GymTimingKind" NOT NULL DEFAULT 'regular',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gym_timings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_equipment" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "exerciseKeyword" TEXT,
    "quantity" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "availabilityUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gym_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_announcements" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" "GymAnnouncementKind" NOT NULL DEFAULT 'notice',
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "gym_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_help_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "locationId" TEXT,
    "memberFirstName" TEXT NOT NULL,
    "memberNumber" TEXT NOT NULL,
    "topic" "GymHelpTopic" NOT NULL,
    "exerciseName" TEXT,
    "workoutName" TEXT,
    "note" TEXT,
    "status" "GymHelpStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "gym_help_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_recipes_userId_createdAt_idx" ON "saved_recipes"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_recipes_userId_recipeId_key" ON "saved_recipes"("userId", "recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "user_partner_links_userId_key" ON "user_partner_links"("userId");

-- CreateIndex
CREATE INDEX "user_partner_links_gymId_idx" ON "user_partner_links"("gymId");

-- CreateIndex
CREATE UNIQUE INDEX "professional_data_sharing_userId_professionalId_key" ON "professional_data_sharing"("userId", "professionalId");

-- CreateIndex
CREATE INDEX "user_data_exports_userId_createdAt_idx" ON "user_data_exports"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "help_articles_slug_key" ON "help_articles"("slug");

-- CreateIndex
CREATE INDEX "help_articles_category_order_idx" ON "help_articles"("category", "order");

-- CreateIndex
CREATE INDEX "gym_timings_gymId_idx" ON "gym_timings"("gymId");

-- CreateIndex
CREATE INDEX "gym_equipment_gymId_idx" ON "gym_equipment"("gymId");

-- CreateIndex
CREATE INDEX "gym_announcements_gymId_postedAt_idx" ON "gym_announcements"("gymId", "postedAt");

-- CreateIndex
CREATE INDEX "gym_help_requests_gymId_status_createdAt_idx" ON "gym_help_requests"("gymId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "gym_help_requests_userId_createdAt_idx" ON "gym_help_requests"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "saved_recipes" ADD CONSTRAINT "saved_recipes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_recipes" ADD CONSTRAINT "saved_recipes_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_partner_links" ADD CONSTRAINT "user_partner_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_partner_links" ADD CONSTRAINT "user_partner_links_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_data_sharing" ADD CONSTRAINT "professional_data_sharing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_data_sharing" ADD CONSTRAINT "professional_data_sharing_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_data_exports" ADD CONSTRAINT "user_data_exports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_timings" ADD CONSTRAINT "gym_timings_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_timings" ADD CONSTRAINT "gym_timings_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "gym_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "gym_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_announcements" ADD CONSTRAINT "gym_announcements_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_help_requests" ADD CONSTRAINT "gym_help_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_help_requests" ADD CONSTRAINT "gym_help_requests_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_help_requests" ADD CONSTRAINT "gym_help_requests_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "gym_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

