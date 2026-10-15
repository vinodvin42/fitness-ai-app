-- FynroX admin roles, admin MFA and maker-checker approvals
-- (blueprint section 5, decisions D15 and D21, Oct 2026).

-- 1. New admin roles. Old roles are mapped:
--    user_operations, coach_operations, content, growth, analytics -> operations
--    super_admin, finance, support -> unchanged
ALTER TYPE "AdminRole" RENAME TO "AdminRole_old";
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'co_founder', 'operations', 'finance', 'safety_privacy', 'support');
ALTER TABLE "admin_users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "admin_users" ALTER COLUMN "role" TYPE "AdminRole" USING (
  CASE "role"::text
    WHEN 'super_admin' THEN 'super_admin'
    WHEN 'finance' THEN 'finance'
    WHEN 'support' THEN 'support'
    ELSE 'operations'
  END
)::"AdminRole";
ALTER TABLE "admin_users" ALTER COLUMN "role" SET DEFAULT 'super_admin';
DROP TYPE "AdminRole_old";

-- 2. Admin sign-in with an authenticator app.
ALTER TABLE "admin_users" ADD COLUMN "mfaSecret" TEXT;
ALTER TABLE "admin_users" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admin_users" ADD COLUMN "mfaEnabledAt" TIMESTAMP(3);
ALTER TABLE "admin_users" ADD COLUMN "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 3. Audit log records the reason, the checker and the approval request.
ALTER TABLE "audit_logs" ADD COLUMN "reason" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "checkerAdminId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "approvalRequestId" TEXT;
CREATE INDEX "audit_logs_checkerAdminId_idx" ON "audit_logs"("checkerAdminId");
CREATE INDEX "audit_logs_approvalRequestId_idx" ON "audit_logs"("approvalRequestId");

-- 4. Approval requests.
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'applying', 'approved', 'rejected', 'changes_requested', 'expired', 'failed', 'cancelled');

CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "makerAdminId" TEXT NOT NULL,
    "makerRole" TEXT NOT NULL,
    "checkerAdminId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "body" JSONB,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decisionNote" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "resultStatus" INTEGER,
    "resultBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_requests_status_createdAt_idx" ON "approval_requests"("status", "createdAt");
CREATE INDEX "approval_requests_makerAdminId_createdAt_idx" ON "approval_requests"("makerAdminId", "createdAt");

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_makerAdminId_fkey" FOREIGN KEY ("makerAdminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_checkerAdminId_fkey" FOREIGN KEY ("checkerAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
