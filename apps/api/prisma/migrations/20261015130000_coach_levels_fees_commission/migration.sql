-- FynroX coach levels, fees per level per service, GST on coach fees and a
-- versioned FynroX commission rate (blueprint 4.2, 4.3; Package 4, Oct 2026).
-- Existing bookings and settlements keep the amounts they already have.

-- 1. Coach levels.
CREATE TABLE "coach_levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_levels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coach_levels_name_key" ON "coach_levels"("name");
CREATE UNIQUE INDEX "coach_levels_rank_key" ON "coach_levels"("rank");

-- 2. Services FynroX sells through coaches.
CREATE TABLE "coach_services" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "serviceType" "ProfessionalServiceType",
    "durationMinutes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_services_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coach_services_key_key" ON "coach_services"("key");

-- 3. Fee per level per service (versioned rows).
CREATE TABLE "coach_level_fees" (
    "id" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_level_fees_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "coach_level_fees_levelId_serviceId_effectiveFrom_idx" ON "coach_level_fees"("levelId", "serviceId", "effectiveFrom");
ALTER TABLE "coach_level_fees" ADD CONSTRAINT "coach_level_fees_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "coach_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_level_fees" ADD CONSTRAINT "coach_level_fees_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "coach_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. FynroX commission rate (versioned; null professionalId = default).
CREATE TABLE "commission_rates" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT,
    "pct" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "commission_rates_professionalId_effectiveFrom_idx" ON "commission_rates"("professionalId", "effectiveFrom");
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Starting data (test data; the Super Admin can rename levels and change
--    fees in the admin console). Fees are before GST.
INSERT INTO "coach_levels" ("id", "name", "rank", "description", "updatedAt") VALUES
  ('level-1', 'Level 1', 1, 'Verified coach', CURRENT_TIMESTAMP),
  ('level-2', 'Level 2', 2, 'Experienced coach', CURRENT_TIMESTAMP),
  ('level-3', 'Level 3', 3, 'Senior coach', CURRENT_TIMESTAMP);

INSERT INTO "coach_services" ("id", "key", "label", "serviceType", "durationMinutes", "updatedAt") VALUES
  ('service-fitness-session', 'fitness-session', 'Fitness Coaching', 'fitness', 45, CURRENT_TIMESTAMP),
  ('service-nutrition-session', 'nutrition-session', 'Nutrition Session', 'nutrition', 30, CURRENT_TIMESTAMP),
  ('service-combined-session', 'combined-session', 'Combined Session', NULL, 60, CURRENT_TIMESTAMP);

INSERT INTO "coach_level_fees" ("id", "levelId", "serviceId", "priceCents", "effectiveFrom", "reason") VALUES
  ('fee-l1-fitness',   'level-1', 'service-fitness-session',   180000, '2020-01-01T00:00:00.000Z', 'Starting fee'),
  ('fee-l1-nutrition', 'level-1', 'service-nutrition-session', 120000, '2020-01-01T00:00:00.000Z', 'Starting fee'),
  ('fee-l1-combined',  'level-1', 'service-combined-session',  250000, '2020-01-01T00:00:00.000Z', 'Starting fee'),
  ('fee-l2-fitness',   'level-2', 'service-fitness-session',   200000, '2020-01-01T00:00:00.000Z', 'Starting fee'),
  ('fee-l2-nutrition', 'level-2', 'service-nutrition-session', 150000, '2020-01-01T00:00:00.000Z', 'Starting fee'),
  ('fee-l2-combined',  'level-2', 'service-combined-session',  300000, '2020-01-01T00:00:00.000Z', 'Starting fee'),
  ('fee-l3-fitness',   'level-3', 'service-fitness-session',   250000, '2020-01-01T00:00:00.000Z', 'Starting fee'),
  ('fee-l3-nutrition', 'level-3', 'service-nutrition-session', 180000, '2020-01-01T00:00:00.000Z', 'Starting fee'),
  ('fee-l3-combined',  'level-3', 'service-combined-session',  380000, '2020-01-01T00:00:00.000Z', 'Starting fee');

-- FynroX default commission: 20% (the old per-coach default).
INSERT INTO "commission_rates" ("id", "professionalId", "pct", "effectiveFrom", "reason") VALUES
  ('commission-default-start', NULL, 20, '2020-01-01T00:00:00.000Z', 'Starting default');

-- Coaches who had a different commission keep it as their own override.
INSERT INTO "commission_rates" ("id", "professionalId", "pct", "effectiveFrom", "reason")
SELECT 'commission-start-' || "id", "id", "commissionPct", '2020-01-01T00:00:00.000Z', 'Carried over from the old per-coach setting'
FROM "professionals" WHERE "commissionPct" <> 20;

-- 6. Coaches get a level (null = not yet placed, so not bookable).
ALTER TABLE "professionals" ADD COLUMN "coachLevelId" TEXT;
CREATE INDEX "professionals_coachLevelId_idx" ON "professionals"("coachLevelId");
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_coachLevelId_fkey" FOREIGN KEY ("coachLevelId") REFERENCES "coach_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "professionals" SET "coachLevelId" = 'level-1' WHERE "id" IN ('coach-alex-rivera', 'coach-priya-nair');
UPDATE "professionals" SET "coachLevelId" = 'level-2' WHERE "id" = 'coach-jordan-blake';

-- 7. Bookings copy the commission and GST when they are made. Existing
--    bookings keep the commission their coach had, and had no GST on top.
ALTER TABLE "bookings" ADD COLUMN "gstCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "commissionPct" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "coachLevelId" TEXT;
UPDATE "bookings" b SET "commissionPct" = p."commissionPct"
FROM "professionals" p WHERE b."professionalId" = p."id";
UPDATE "bookings" SET "commissionPct" = 20 WHERE "commissionPct" IS NULL;
ALTER TABLE "bookings" ALTER COLUMN "commissionPct" SET NOT NULL;

-- 8. Offerings point at a service; the price now comes from the level fee.
ALTER TABLE "professional_service_offerings" ADD COLUMN "serviceId" TEXT;
UPDATE "professional_service_offerings" SET "serviceId" = CASE "serviceType"
  WHEN 'fitness' THEN 'service-fitness-session'
  WHEN 'nutrition' THEN 'service-nutrition-session'
  ELSE 'service-combined-session' END;
ALTER TABLE "professional_service_offerings" ALTER COLUMN "serviceId" SET NOT NULL;
CREATE INDEX "professional_service_offerings_serviceId_idx" ON "professional_service_offerings"("serviceId");
ALTER TABLE "professional_service_offerings" ADD CONSTRAINT "professional_service_offerings_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "coach_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "professional_service_offerings" DROP COLUMN "priceCents";

-- 9. Booking payments remember the fee and GST split.
ALTER TABLE "payments" ADD COLUMN "feeCents" INTEGER;
ALTER TABLE "payments" ADD COLUMN "taxCents" INTEGER;
ALTER TABLE "payments" ADD COLUMN "coachLevelId" TEXT;
UPDATE "payments" SET "feeCents" = "amountCents" + COALESCE("discountCents", 0), "taxCents" = 0
WHERE "purpose" = 'booking';

-- 10. The old per-coach column is replaced by commission_rates.
ALTER TABLE "professionals" DROP COLUMN "commissionPct";
