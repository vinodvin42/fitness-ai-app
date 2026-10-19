-- Read-only snapshot of the data the four branch migrations touch.
-- Run before and after the upgrade; compare the two outputs.
-- Every query tolerates tables/columns that exist on only one side.
\pset footer off
\pset format aligned

\echo '--- users / guardian data'
SELECT count(*) AS users FROM "users";
SELECT CASE WHEN to_regclass('public.guardian_reviews') IS NULL THEN 'guardian_reviews: TABLE ABSENT'
            ELSE 'guardian_reviews: present' END AS guardian_table;

\echo '--- admin roles'
SELECT "id", "role"::text AS role FROM "admin_users" WHERE "id" LIKE 'fx-%' ORDER BY "id";

\echo '--- plans'
SELECT "id", "tier"::text AS tier, "name", "priceCents", "isActive" FROM "subscription_plans" ORDER BY "id";

\echo '--- subscriptions (priceCents column exists only after the upgrade)'
SELECT to_jsonb(s) - 'createdAt' - 'updatedAt' AS subscription FROM "subscriptions" s WHERE "id" LIKE 'fx-%' ORDER BY "id";

\echo '--- scheduled price changes'
SELECT to_regclass('public.plan_price_changes') IS NOT NULL AS has_ppc \gset
\if :has_ppc
SELECT "id", "planId", "previousCents", "priceCents", "effectiveFrom", "status"::text AS status, ("noticeSentAt" IS NOT NULL) AS notice_sent FROM "plan_price_changes" ORDER BY "id";
\else
\echo 'plan_price_changes: table absent'
\endif

\echo '--- notifications created for users'
SELECT "title", count(*) AS n FROM "notifications" GROUP BY "title" ORDER BY "title";

\echo '--- coaches (commissionPct column exists only before; coachLevelId only after)'
SELECT to_jsonb(p) - 'passwordHash' - 'createdAt' - 'updatedAt' AS professional FROM "professionals" p ORDER BY "id";

\echo '--- coach offerings (priceCents only before; serviceId only after)'
SELECT to_jsonb(o) - 'createdAt' - 'updatedAt' AS offering FROM "professional_service_offerings" o ORDER BY "id";

\echo '--- bookings and payments'
SELECT to_jsonb(b) - 'createdAt' - 'updatedAt' AS booking FROM "bookings" b ORDER BY "id";
SELECT to_jsonb(p) - 'createdAt' - 'updatedAt' AS payment FROM "payments" p ORDER BY "id";

\echo '--- coach levels, fees and commission rates (exist only after the upgrade)'
SELECT to_regclass('public.coach_levels') IS NOT NULL AS has_levels \gset
\if :has_levels
SELECT "id", "name", "rank" FROM "coach_levels" ORDER BY "rank";
SELECT count(*) AS coach_level_fees FROM "coach_level_fees";
SELECT "id", "professionalId", "pct", "reason" FROM "commission_rates" ORDER BY "id";
\else
\echo 'coach_levels / coach_level_fees / commission_rates: tables absent'
\endif

\echo '--- migration history table'
SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_history \gset
\if :has_history
SELECT count(*) AS recorded_migrations FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL;
\else
\echo '_prisma_migrations: absent (migrations were not applied through Prisma Migrate)'
\endif
