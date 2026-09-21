-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actorInfluencerId" TEXT;

-- AlterTable
ALTER TABLE "influencers" ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "influencer_refresh_tokens" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "influencer_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "influencer_refresh_tokens_tokenHash_key" ON "influencer_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "influencer_refresh_tokens_influencerId_idx" ON "influencer_refresh_tokens"("influencerId");

-- CreateIndex
CREATE INDEX "audit_logs_actorInfluencerId_idx" ON "audit_logs"("actorInfluencerId");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorInfluencerId_fkey" FOREIGN KEY ("actorInfluencerId") REFERENCES "influencers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_refresh_tokens" ADD CONSTRAINT "influencer_refresh_tokens_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
