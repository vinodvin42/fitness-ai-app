-- Safety & Abuse Reports (admin 08.04) and coach-chat blocking, 18 Oct 2026.
-- App-store rules for apps where people message each other (Apple 1.2,
-- Google Play user-content policy) require reporting and blocking. Additive
-- only: two new tables, four new enums, and a nullable removedAt on
-- coach_messages. Generated with prisma migrate diff from the schema.


-- CreateEnum
CREATE TYPE "SafetyReportReason" AS ENUM ('harassment', 'sexual_content', 'threats_or_hate', 'spam_or_scam', 'unsafe_advice', 'impersonation', 'other');

-- CreateEnum
CREATE TYPE "SafetyReportSeverity" AS ENUM ('high', 'normal');

-- CreateEnum
CREATE TYPE "SafetyReportStatus" AS ENUM ('open', 'actioned', 'dismissed');

-- CreateEnum
CREATE TYPE "SafetyReportOutcome" AS ENUM ('dismissed', 'warning', 'message_removed', 'account_suspended');

-- AlterTable
ALTER TABLE "coach_messages" ADD COLUMN     "removedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "safety_reports" (
    "id" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reporterProfessionalId" TEXT,
    "reportedUserId" TEXT,
    "reportedProfessionalId" TEXT,
    "messageId" TEXT,
    "messageExcerpt" TEXT,
    "reason" "SafetyReportReason" NOT NULL,
    "details" TEXT,
    "severity" "SafetyReportSeverity" NOT NULL,
    "status" "SafetyReportStatus" NOT NULL DEFAULT 'open',
    "outcome" "SafetyReportOutcome",
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "safety_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_chat_blocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "blockedBy" "CoachMessageSender" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coach_chat_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "safety_reports_status_severity_createdAt_idx" ON "safety_reports"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "safety_reports_reportedUserId_idx" ON "safety_reports"("reportedUserId");

-- CreateIndex
CREATE INDEX "safety_reports_reportedProfessionalId_idx" ON "safety_reports"("reportedProfessionalId");

-- CreateIndex
CREATE INDEX "coach_chat_blocks_professionalId_idx" ON "coach_chat_blocks"("professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "coach_chat_blocks_userId_professionalId_blockedBy_key" ON "coach_chat_blocks"("userId", "professionalId", "blockedBy");

-- AddForeignKey
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reporterProfessionalId_fkey" FOREIGN KEY ("reporterProfessionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reportedProfessionalId_fkey" FOREIGN KEY ("reportedProfessionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "coach_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_chat_blocks" ADD CONSTRAINT "coach_chat_blocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_chat_blocks" ADD CONSTRAINT "coach_chat_blocks_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
