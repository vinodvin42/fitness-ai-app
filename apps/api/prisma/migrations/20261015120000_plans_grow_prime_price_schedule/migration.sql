-- FynroX plans: Basic / Grow / Prime, 3-month billing, locked subscriber
-- price and scheduled price changes (decisions D8, D13, D18; Oct 2026).

-- 1. Rename plan tiers (existing rows keep their ids and move with the rename).
ALTER TYPE "SubscriptionTier" RENAME VALUE 'pro' TO 'grow';
ALTER TYPE "SubscriptionTier" RENAME VALUE 'elite' TO 'prime';

-- 2. Pay every 3 months.
ALTER TYPE "BillingCycle" ADD VALUE IF NOT EXISTS 'quarterly' AFTER 'monthly';

-- 3. The price each subscriber paid for the current period. Existing
--    subscriptions keep the price their plan had before this migration.
ALTER TABLE "subscriptions" ADD COLUMN "priceCents" INTEGER;
UPDATE "subscriptions" s SET "priceCents" = p."priceCents"
FROM "subscription_plans" p
WHERE s."planId" = p."id";

-- 4. Bring the seeded plans to the FynroX names and prices (test data only).
--    Yearly prices are not decided yet, so the yearly plans are switched off
--    until the Super Admin sets their prices.
UPDATE "subscription_plans" SET "name" = 'Grow', "priceCents" = 29900 WHERE "id" = 'pro';
UPDATE "subscription_plans" SET "name" = 'Prime', "priceCents" = 59900 WHERE "id" = 'elite';
UPDATE "subscription_plans" SET "name" = 'Grow', "isActive" = false WHERE "id" = 'pro-annual';
UPDATE "subscription_plans" SET "name" = 'Prime', "isActive" = false WHERE "id" = 'elite-annual';

-- 5. Scheduled price changes.
CREATE TYPE "PlanPriceChangeStatus" AS ENUM ('scheduled', 'applied', 'cancelled');

CREATE TABLE "plan_price_changes" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "previousCents" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "status" "PlanPriceChangeStatus" NOT NULL DEFAULT 'scheduled',
    "reason" TEXT,
    "createdByAdminId" TEXT,
    "noticeSentAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_price_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plan_price_changes_planId_status_effectiveFrom_idx" ON "plan_price_changes"("planId", "status", "effectiveFrom");
CREATE INDEX "plan_price_changes_status_effectiveFrom_idx" ON "plan_price_changes"("status", "effectiveFrom");
-- Only one scheduled change per plan per start date.
CREATE UNIQUE INDEX "plan_price_changes_one_scheduled_per_date" ON "plan_price_changes"("planId", "effectiveFrom") WHERE "status" = 'scheduled';

ALTER TABLE "plan_price_changes" ADD CONSTRAINT "plan_price_changes_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Grow becomes ₹349 for purchases and renewals from 1 Dec 2026 (D8);
--    anyone already paid keeps ₹299 until their next renewal.
INSERT INTO "plan_price_changes" ("id", "planId", "priceCents", "previousCents", "effectiveFrom", "reason", "updatedAt")
SELECT 'seed-grow-349-2026-12-01', 'pro', 34900, 29900, '2026-11-30T18:30:00.000Z', 'Grow ₹299 → ₹349 from 1 Dec 2026 (decision D8)', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "subscription_plans" WHERE "id" = 'pro');

-- 7. Tell current Grow subscribers about the change now (in-app notice).
INSERT INTO "notifications" ("id", "userId", "kind", "title", "body", "deepLink", "createdAt")
SELECT gen_random_uuid()::text, u."userId", 'system'::"NotificationKind", 'Grow price change',
       'From 1 December 2026, Grow will be ₹349 per month. You keep your current price until your next renewal on or after that date.',
       'fynrox://subscription', CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "userId" FROM "subscriptions"
  WHERE "planId" = 'pro' AND "status" IN ('active', 'trialing', 'past_due')
) u
WHERE EXISTS (SELECT 1 FROM "plan_price_changes" WHERE "id" = 'seed-grow-349-2026-12-01');

UPDATE "plan_price_changes" SET "noticeSentAt" = CURRENT_TIMESTAMP
WHERE "id" = 'seed-grow-349-2026-12-01';
