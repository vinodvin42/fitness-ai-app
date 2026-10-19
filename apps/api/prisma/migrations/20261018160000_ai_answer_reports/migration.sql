-- AI Safety / Overrides (admin 11.03), 18 Oct 2026. Google Play requires apps
-- with generative AI to let people report offensive AI output in-app. Additive
-- only: one new table, two new enums, and a nullable hiddenAt on
-- ai_coach_messages. Generated with prisma migrate diff from the schema.

-- CreateEnum
CREATE TYPE "AiAnswerReportReason" AS ENUM ('unsafe_or_harmful', 'medically_wrong', 'offensive', 'other');

-- CreateEnum
CREATE TYPE "AiAnswerReportStatus" AS ENUM ('open', 'reviewed', 'answer_hidden');

-- AlterTable
ALTER TABLE "ai_coach_messages" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ai_answer_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "questionText" TEXT,
    "answerText" TEXT NOT NULL,
    "reason" "AiAnswerReportReason" NOT NULL,
    "note" TEXT,
    "status" "AiAnswerReportStatus" NOT NULL DEFAULT 'open',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_answer_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_answer_reports_messageId_key" ON "ai_answer_reports"("messageId");

-- CreateIndex
CREATE INDEX "ai_answer_reports_status_createdAt_idx" ON "ai_answer_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_answer_reports_userId_idx" ON "ai_answer_reports"("userId");

-- AddForeignKey
ALTER TABLE "ai_answer_reports" ADD CONSTRAINT "ai_answer_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_answer_reports" ADD CONSTRAINT "ai_answer_reports_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ai_coach_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_answer_reports" ADD CONSTRAINT "ai_answer_reports_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

