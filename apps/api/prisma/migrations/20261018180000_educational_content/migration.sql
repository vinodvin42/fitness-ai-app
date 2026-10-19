-- 05.04 Educational Content, 18 Oct 2026. The Learn library: a new articles
-- table, two new enums, and an 'article' value on ContentReviewContentType so
-- articles go through the 05.05 review queue. Additive only; no articles are
-- seeded. ALTER TYPE ... ADD VALUE is safe on PostgreSQL 12+ even inside a
-- transaction, as nothing in this file uses the new value.
-- Generated with prisma migrate diff from the schema.

-- CreateEnum
CREATE TYPE "ArticleTopic" AS ENUM ('training', 'nutrition', 'recovery', 'sleep', 'mindset');

-- CreateEnum
CREATE TYPE "ArticleAudience" AS ENUM ('everyone', 'beginner', 'intermediate', 'advanced');

-- AlterEnum
ALTER TYPE "ContentReviewContentType" ADD VALUE 'article';

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "topic" "ArticleTopic" NOT NULL,
    "audience" "ArticleAudience" NOT NULL DEFAULT 'everyone',
    "readMinutes" INTEGER NOT NULL,
    "coverImageUrl" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "createdByAdminId" TEXT,
    "expertReviewerName" TEXT,
    "expertReviewerCredentials" TEXT,
    "expertReviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_status_topic_idx" ON "articles"("status", "topic");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

