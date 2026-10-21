-- Plans (owner, 21 Oct 2026): "basic plan never expire we have only 2 plans one is basic and another one is prime,
-- prime is 299 including tax it will become 399 from jan1st 2027".
--
-- Prices: the same effect as Admin -> Commerce -> Pricing (scheduled price changes and an archive), written as data
-- so it ships with the deploy. Prices stay owned by the Super Admin afterwards. Unlike the admin route, this sends no
-- in-app notice of the January increase to current Prime members. Members who already paid keep their price for the
-- period they paid for (Subscription.priceCents).

-- 1. Only the schedule below stands for Prime: any Prime change still scheduled (e.g. the ₹499 discussed on
--    20 Oct) is cancelled.
UPDATE "plan_price_changes"
SET "status" = 'cancelled', "cancelledAt" = (now() AT TIME ZONE 'UTC'), "updatedAt" = (now() AT TIME ZONE 'UTC')
WHERE "planId" = 'elite' AND "status" = 'scheduled';

-- 2. Prime ₹299 incl. GST from now. lib/planPricing.ts applies it on the next plan-list read (a decrease needs no
--    notice). Skipped if Prime is already ₹299.
INSERT INTO "plan_price_changes" ("id", "planId", "priceCents", "previousCents", "effectiveFrom", "status", "reason", "createdAt", "updatedAt")
SELECT 'owner-2026-10-21-prime-299', p."id", 29900, p."priceCents", (now() AT TIME ZONE 'UTC'), 'scheduled',
       'Prime ₹299 incl. GST (owner, 21 Oct 2026)', (now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC')
FROM "subscription_plans" p
WHERE p."id" = 'elite' AND p."priceCents" <> 29900
ON CONFLICT ("id") DO NOTHING;

-- 3. Prime ₹399 incl. GST from 1 Jan 2027, India time (00:00 IST = 2026-12-31 18:30 UTC).
INSERT INTO "plan_price_changes" ("id", "planId", "priceCents", "previousCents", "effectiveFrom", "status", "reason", "createdAt", "updatedAt")
SELECT 'owner-2026-10-21-prime-399-2027-01-01', p."id", 39900, 29900, TIMESTAMP '2026-12-31 18:30:00', 'scheduled',
       'Prime ₹399 incl. GST from 1 Jan 2027 (owner, 21 Oct 2026)', (now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC')
FROM "subscription_plans" p
WHERE p."id" = 'elite'
ON CONFLICT ("id") DO NOTHING;

-- 4. Grow (monthly and yearly) is no longer offered to new members; anyone already on it keeps what they paid for.
--    Its scheduled ₹349 change is cancelled.
UPDATE "subscription_plans" SET "isActive" = false, "updatedAt" = (now() AT TIME ZONE 'UTC')
WHERE "tier" = 'grow' AND "isActive" = true;
UPDATE "plan_price_changes"
SET "status" = 'cancelled', "cancelledAt" = (now() AT TIME ZONE 'UTC'), "updatedAt" = (now() AT TIME ZONE 'UTC')
WHERE "status" = 'scheduled' AND "planId" IN (SELECT "id" FROM "subscription_plans" WHERE "tier" = 'grow');

-- 5. Basic never ends: current free-plan subscriptions lose their end date and any "cancel at period end".
--    (A free plan that already expired that way is made active again when it is next read; see
--    settleFreePlan in subscriptions.service.ts.)
UPDATE "subscriptions" s
SET "cancelAtPeriodEnd" = false, "renewsAt" = NULL
FROM "subscription_plans" p
WHERE s."planId" = p."id"
  AND p."priceCents" = 0
  AND COALESCE(s."priceCents", 0) = 0
  AND s."status" IN ('active', 'trialing', 'past_due')
  AND (s."cancelAtPeriodEnd" = true OR s."renewsAt" IS NOT NULL);
