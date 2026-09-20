-- CreateEnum
CREATE TYPE "AcquisitionChannel" AS ENUM ('organic', 'paid_search', 'paid_social', 'referral', 'influencer', 'gym_partner', 'direct');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "TouchpointType" AS ENUM ('link_click', 'signup', 'first_workout', 'paid_conversion');

-- CreateTable
CREATE TABLE "acquisition_sources" (
    "id" TEXT NOT NULL,
    "channel" "AcquisitionChannel" NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acquisition_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "linkCode" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'active',
    "gymId" TEXT,
    "influencerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "touchpoints" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "campaignId" TEXT,
    "channel" "AcquisitionChannel" NOT NULL,
    "touchpointType" "TouchpointType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "touchpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acquisition_sources_channel_key" ON "acquisition_sources"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_linkCode_key" ON "campaigns"("linkCode");

-- CreateIndex
CREATE INDEX "campaigns_sourceId_idx" ON "campaigns"("sourceId");

-- CreateIndex
CREATE INDEX "campaigns_influencerId_idx" ON "campaigns"("influencerId");

-- CreateIndex
CREATE INDEX "touchpoints_userId_occurredAt_idx" ON "touchpoints"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "touchpoints_campaignId_idx" ON "touchpoints"("campaignId");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "acquisition_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
