-- Batch 3a (18 Oct 2026, owner-approved): per-session exercise list (swaps,
-- added exercises, supersets), drop vs failure sets, per-exercise rest and the
-- optional "How did it feel?". Additive only: no existing column changes and no
-- data rewrite. Existing isDropSet=true rows stay drop sets.

-- CreateEnum
CREATE TYPE "SessionFeel" AS ENUM ('easy', 'about_right', 'hard');

-- CreateEnum
CREATE TYPE "SessionExerciseSource" AS ENUM ('plan', 'swapped', 'added');

-- AlterTable
ALTER TABLE "workout_sessions" ADD COLUMN     "feel" "SessionFeel";

-- AlterTable
ALTER TABLE "exercise_set_logs" ADD COLUMN     "isFailure" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "workout_session_exercises" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "workoutExerciseId" TEXT,
    "order" INTEGER NOT NULL,
    "phase" "WorkoutPhase" NOT NULL DEFAULT 'main',
    "targetSets" INTEGER NOT NULL,
    "targetReps" INTEGER NOT NULL,
    "supersetGroup" TEXT,
    "source" "SessionExerciseSource" NOT NULL DEFAULT 'plan',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_session_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_rest_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "restSeconds" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercise_rest_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_session_exercises_sessionId_idx" ON "workout_session_exercises"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_rest_preferences_userId_exerciseId_key" ON "exercise_rest_preferences"("userId", "exerciseId");

-- AddForeignKey
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "workout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_rest_preferences" ADD CONSTRAINT "exercise_rest_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_rest_preferences" ADD CONSTRAINT "exercise_rest_preferences_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
