-- CreateEnum
CREATE TYPE "PublicApplicationKind" AS ENUM ('early_access', 'gym', 'creator', 'professional', 'contact');

-- CreateEnum
CREATE TYPE "PublicApplicationStatus" AS ENUM ('new', 'in_review', 'contacted', 'converted', 'rejected');

-- CreateTable
CREATE TABLE "public_applications" (
    "id" TEXT NOT NULL,
    "kind" "PublicApplicationKind" NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "organisation" TEXT,
    "city" TEXT,
    "detail" TEXT,
    "message" TEXT,
    "sourceCode" TEXT,
    "sourceKind" TEXT,
    "consentContact" BOOLEAN NOT NULL DEFAULT false,
    "consentMarketing" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PublicApplicationStatus" NOT NULL DEFAULT 'new',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_applications_kind_status_createdAt_idx" ON "public_applications"("kind", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "public_applications_kind_email_key" ON "public_applications"("kind", "email");

-- AddForeignKey
ALTER TABLE "public_applications" ADD CONSTRAINT "public_applications_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
