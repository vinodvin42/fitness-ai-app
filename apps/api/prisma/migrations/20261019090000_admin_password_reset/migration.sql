-- Admin forgot/reset password, 19 Oct 2026. One new table holding only the hash
-- of each emailed reset token (30 minutes, single use), like
-- password_reset_tokens for app users. Additive only.
-- Generated with prisma migrate diff from the schema.

-- CreateTable
CREATE TABLE "admin_password_reset_tokens" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_password_reset_tokens_tokenHash_key" ON "admin_password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "admin_password_reset_tokens_adminUserId_idx" ON "admin_password_reset_tokens"("adminUserId");

-- AddForeignKey
ALTER TABLE "admin_password_reset_tokens" ADD CONSTRAINT "admin_password_reset_tokens_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

