-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('reminder', 'workout', 'nutrition', 'coach', 'billing', 'system');

-- CreateEnum
CREATE TYPE "HealthProvider" AS ENUM ('apple_health', 'health_connect', 'garmin', 'fitbit', 'whoop', 'oura');

-- CreateEnum
CREATE TYPE "HealthConnectionStatus" AS ENUM ('connected', 'revoked');

-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('watch', 'band', 'ring', 'scale', 'other');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('paired', 'syncing', 'error', 'disconnected');

-- CreateEnum
CREATE TYPE "DoseStatus" AS ENUM ('taken', 'skipped', 'snoozed');

-- CreateEnum
CREATE TYPE "WorkoutWeightUnit" AS ENUM ('kg', 'lb');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('run', 'ride');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('manual', 'tracked');

-- CreateEnum
CREATE TYPE "FormAnalysisStatus" AS ENUM ('queued', 'reviewed');

-- CreateEnum
CREATE TYPE "GuardianReviewStatus" AS ENUM ('pending', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "UserDataExportStatus" AS ENUM ('ready', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "HelpArticleCategory" AS ENUM ('getting_started', 'workouts', 'nutrition', 'billing', 'professionals');

-- CreateEnum
CREATE TYPE "GymTimingKind" AS ENUM ('regular', 'women_only', 'special');

-- CreateEnum
CREATE TYPE "GymAnnouncementKind" AS ENUM ('holiday', 'notice');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "unitPreferences" JSONB;

-- AlterTable
ALTER TABLE "onboarding_profiles" ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "healthDataSkippedAt" TIMESTAMP(3),
ADD COLUMN     "targetWeightKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "ownerUserId" TEXT;

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "ingredients" JSONB,
ADD COLUMN     "instructions" TEXT[] DEFAULT ARRAY[]::TEXT[];

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

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "summaryPublishedAt" TIMESTAMP(3),
ADD COLUMN     "summaryText" TEXT;

-- AlterTable
ALTER TABLE "recovery_logs" ADD COLUMN     "activeCalories" INTEGER,
ADD COLUMN     "activeMinutes" INTEGER,
ADD COLUMN     "spo2" INTEGER,
ADD COLUMN     "steps" INTEGER,
ADD COLUMN     "stressScore" INTEGER;

-- AlterTable
ALTER TABLE "gyms" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

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
CREATE TABLE "saved_meals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "proteinG" INTEGER NOT NULL DEFAULT 0,
    "carbsG" INTEGER NOT NULL DEFAULT 0,
    "fatG" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL DEFAULT 'system',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" TEXT,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutReminders" BOOLEAN NOT NULL DEFAULT true,
    "mealReminders" BOOLEAN NOT NULL DEFAULT true,
    "coachMessages" BOOLEAN NOT NULL DEFAULT true,
    "billing" BOOLEAN NOT NULL DEFAULT true,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "masterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hydrationReminders" BOOLEAN NOT NULL DEFAULT true,
    "frequencyCap" INTEGER,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "HealthProvider" NOT NULL,
    "status" "HealthConnectionStatus" NOT NULL DEFAULT 'connected',
    "scopes" TEXT[],
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "health_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connected_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "HealthProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DeviceKind" NOT NULL DEFAULT 'other',
    "status" "DeviceStatus" NOT NULL DEFAULT 'paired',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "batteryPct" INTEGER,
    "permissions" TEXT[] DEFAULT ARRAY['steps', 'heart_rate', 'sleep', 'spo2', 'stress', 'workouts']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connected_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sync_runs" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsIngested" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'success',

    CONSTRAINT "device_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "form" TEXT,
    "scheduleTimes" TEXT[],
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repeatMode" TEXT NOT NULL DEFAULT 'daily',
    "mealTiming" TEXT,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "vibrationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailedPreview" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_dose_logs" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "DoseStatus" NOT NULL,
    "snoozedUntil" TIMESTAMP(3),
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_dose_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routines" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "workoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_exercises" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "targetSets" INTEGER NOT NULL DEFAULT 3,
    "targetReps" INTEGER NOT NULL DEFAULT 10,
    "restSeconds" INTEGER,

    CONSTRAINT "routine_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restTimerSeconds" INTEGER NOT NULL DEFAULT 90,
    "autoStartRest" BOOLEAN NOT NULL DEFAULT true,
    "weightUnit" "WorkoutWeightUnit" NOT NULL DEFAULT 'kg',
    "countdownSound" BOOLEAN NOT NULL DEFAULT true,
    "keepScreenAwake" BOOLEAN NOT NULL DEFAULT true,
    "defaultRpeTracking" BOOLEAN NOT NULL DEFAULT false,
    "preferredDurationMinutes" INTEGER NOT NULL DEFAULT 45,
    "audioCoaching" BOOLEAN NOT NULL DEFAULT true,
    "autoDeloadWeek" BOOLEAN NOT NULL DEFAULT false,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trainingDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "avgPaceSecPerKm" INTEGER,
    "avgSpeedKmh" DOUBLE PRECISION,
    "elevationGainM" INTEGER,
    "calories" INTEGER,
    "routePolyline" TEXT,
    "source" "ActivitySource" NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_analysis_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT,
    "videoUrl" TEXT,
    "status" "FormAnalysisStatus" NOT NULL DEFAULT 'queued',
    "coachNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByProfessionalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_analysis_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_reviews" (
    "userId" TEXT NOT NULL,
    "guardianName" TEXT,
    "guardianEmail" TEXT NOT NULL,
    "relationship" TEXT,
    "status" "GuardianReviewStatus" NOT NULL DEFAULT 'pending',
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_reviews_pkey" PRIMARY KEY ("userId")
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

-- CreateIndex
CREATE INDEX "saved_recipes_userId_createdAt_idx" ON "saved_recipes"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_recipes_userId_recipeId_key" ON "saved_recipes"("userId", "recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "user_partner_links_userId_key" ON "user_partner_links"("userId");

-- CreateIndex
CREATE INDEX "user_partner_links_gymId_idx" ON "user_partner_links"("gymId");

-- CreateIndex
CREATE INDEX "saved_meals_userId_createdAt_idx" ON "saved_meals"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "health_connections_userId_idx" ON "health_connections"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "health_connections_userId_provider_key" ON "health_connections"("userId", "provider");

-- CreateIndex
CREATE INDEX "connected_devices_userId_idx" ON "connected_devices"("userId");

-- CreateIndex
CREATE INDEX "device_sync_runs_deviceId_startedAt_idx" ON "device_sync_runs"("deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "device_sync_runs_userId_idx" ON "device_sync_runs"("userId");

-- CreateIndex
CREATE INDEX "medications_userId_idx" ON "medications"("userId");

-- CreateIndex
CREATE INDEX "medication_dose_logs_userId_scheduledFor_idx" ON "medication_dose_logs"("userId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "medication_dose_logs_medicationId_scheduledFor_key" ON "medication_dose_logs"("medicationId", "scheduledFor");

-- CreateIndex
CREATE INDEX "routines_userId_idx" ON "routines"("userId");

-- CreateIndex
CREATE INDEX "routine_exercises_routineId_idx" ON "routine_exercises"("routineId");

-- CreateIndex
CREATE UNIQUE INDEX "workout_settings_userId_key" ON "workout_settings"("userId");

-- CreateIndex
CREATE INDEX "activity_logs_userId_startedAt_idx" ON "activity_logs"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "form_analysis_submissions_userId_createdAt_idx" ON "form_analysis_submissions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "form_analysis_submissions_status_createdAt_idx" ON "form_analysis_submissions"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_reviews_tokenHash_key" ON "guardian_reviews"("tokenHash");

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
CREATE INDEX "programs_ownerUserId_idx" ON "programs"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_coach_messages_userId_clientId_key" ON "ai_coach_messages"("userId", "clientId");

-- AddForeignKey
ALTER TABLE "saved_recipes" ADD CONSTRAINT "saved_recipes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_recipes" ADD CONSTRAINT "saved_recipes_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_partner_links" ADD CONSTRAINT "user_partner_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_partner_links" ADD CONSTRAINT "user_partner_links_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_meals" ADD CONSTRAINT "saved_meals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_connections" ADD CONSTRAINT "health_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connected_devices" ADD CONSTRAINT "connected_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sync_runs" ADD CONSTRAINT "device_sync_runs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "connected_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sync_runs" ADD CONSTRAINT "device_sync_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_dose_logs" ADD CONSTRAINT "medication_dose_logs_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_dose_logs" ADD CONSTRAINT "medication_dose_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_settings" ADD CONSTRAINT "workout_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_analysis_submissions" ADD CONSTRAINT "form_analysis_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_reviews" ADD CONSTRAINT "guardian_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

