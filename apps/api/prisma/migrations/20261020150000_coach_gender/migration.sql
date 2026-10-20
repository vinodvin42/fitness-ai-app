-- Coach gender (owner, 20 Oct 2026: "give male and female coaches option"). Additive only: a new enum,
-- a nullable gender on professionals (not stated until the coach or an admin sets it) and a nullable
-- coach-gender preference on guidance requests (no preference by default). See lib/coachGender.ts.

-- CreateEnum
CREATE TYPE "CoachGender" AS ENUM ('male', 'female');

-- AlterTable
ALTER TABLE "guidance_requests" ADD COLUMN     "coachGenderPreference" "CoachGender";

-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "gender" "CoachGender";
