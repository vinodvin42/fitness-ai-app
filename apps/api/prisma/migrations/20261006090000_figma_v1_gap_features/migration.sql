-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('reminder', 'workout', 'coach', 'billing', 'system');

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
CREATE TYPE "QuoteRequestStatus" AS ENUM ('pending', 'quoted', 'declined', 'accepted', 'expired');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "summaryPublishedAt" TIMESTAMP(3),
ADD COLUMN     "summaryText" TEXT;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL DEFAULT 'system',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" TEXT,
    "readAt" TIMESTAMP(3),
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_analysis_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'pending',
    "quotedPriceCents" INTEGER,
    "currency" TEXT,
    "quoteNote" TEXT,
    "quoteExpiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "quote_requests_userId_createdAt_idx" ON "quote_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "quote_requests_professionalId_status_idx" ON "quote_requests"("professionalId", "status");

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
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

