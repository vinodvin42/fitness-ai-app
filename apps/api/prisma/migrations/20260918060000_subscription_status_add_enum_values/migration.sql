-- Gap §57 (18 Sep 2026): real cancel-at-period-end policy + admin
-- force-revoke. Split into its own migration, same reason as
-- 20260915135930_relationship_status_add_enum_values before it — Postgres
-- won't let a newly-added enum value be referenced by another statement in
-- the same transaction that added it.
ALTER TYPE "SubscriptionStatus" ADD VALUE 'expired';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'revoked';
