-- Representative SYNTHETIC data on the schema at origin/main (909a7b6),
-- used to test the upgrade to blueprint-p1-p2's four new migrations.
-- TEST-ONLY: every name, email and amount is invented. Amounts are fixture
-- values chosen to make each migration's effect visible, not real prices.
-- Never run against a real database: the runner only applies it to a
-- throwaway database it created.
BEGIN;

INSERT INTO "users" ("id", "email", "passwordHash", "fullName", "referralCode", "updatedAt") VALUES
  ('fx-user-minor',    'fx-minor@fynrox-upgrade.invalid',    'x', 'TEST-ONLY under-18 user (guardian flow)', 'FXREF0001', now()),
  ('fx-user-grow-1',   'fx-grow-1@fynrox-upgrade.invalid',   'x', 'TEST-ONLY Grow subscriber 1',             'FXREF0002', now()),
  ('fx-user-grow-2',   'fx-grow-2@fynrox-upgrade.invalid',   'x', 'TEST-ONLY Grow trial user',               'FXREF0003', now()),
  ('fx-user-grow-off', 'fx-grow-off@fynrox-upgrade.invalid', 'x', 'TEST-ONLY cancelled Grow user',           'FXREF0004', now()),
  ('fx-user-prime-1',  'fx-prime-1@fynrox-upgrade.invalid',  'x', 'TEST-ONLY Prime subscriber',              'FXREF0005', now()),
  ('fx-user-booker',   'fx-booker@fynrox-upgrade.invalid',   'x', 'TEST-ONLY coaching client',               'FXREF0006', now());

-- Guardian flow data that the adults-only migration drops.
INSERT INTO "guardian_reviews" ("userId", "guardianName", "guardianEmail", "relationship", "updatedAt") VALUES
  ('fx-user-minor', 'TEST-ONLY guardian', 'fx-guardian@fynrox-upgrade.invalid', 'parent', now());

-- One admin per role that exists on main, to see how each is mapped.
INSERT INTO "admin_users" ("id", "email", "passwordHash", "fullName", "role", "updatedAt") VALUES
  ('fx-admin-super',     'fx-a-super@fynrox-upgrade.invalid',     'x', 'TEST-ONLY super_admin',     'super_admin',     now()),
  ('fx-admin-userops',   'fx-a-userops@fynrox-upgrade.invalid',   'x', 'TEST-ONLY user_operations', 'user_operations', now()),
  ('fx-admin-coachops',  'fx-a-coachops@fynrox-upgrade.invalid',  'x', 'TEST-ONLY coach_operations','coach_operations',now()),
  ('fx-admin-support',   'fx-a-support@fynrox-upgrade.invalid',   'x', 'TEST-ONLY support',         'support',         now()),
  ('fx-admin-analytics', 'fx-a-analytics@fynrox-upgrade.invalid', 'x', 'TEST-ONLY analytics',       'analytics',       now()),
  ('fx-admin-growth',    'fx-a-growth@fynrox-upgrade.invalid',    'x', 'TEST-ONLY growth',          'growth',          now()),
  ('fx-admin-content',   'fx-a-content@fynrox-upgrade.invalid',   'x', 'TEST-ONLY content',         'content',         now()),
  ('fx-admin-finance',   'fx-a-finance@fynrox-upgrade.invalid',   'x', 'TEST-ONLY finance',         'finance',         now());

-- Plans with the ids the migrations target. Prices are fixture values.
INSERT INTO "subscription_plans" ("id", "tier", "name", "priceCents", "billingCycle", "isActive", "updatedAt") VALUES
  ('basic',        'basic', 'Basic',       0,      'monthly', true, now()),
  ('pro',          'pro',   'Pro',         49900,  'monthly', true, now()),
  ('pro-annual',   'pro',   'Pro Annual',  499000, 'annual',  true, now()),
  ('elite',        'elite', 'Elite',       99900,  'monthly', true, now()),
  ('elite-annual', 'elite', 'Elite Annual',999000, 'annual',  true, now());

INSERT INTO "subscriptions" ("id", "userId", "planId", "status", "renewsAt") VALUES
  ('fx-sub-grow-1',   'fx-user-grow-1',   'pro',   'active',   now() + interval '20 days'),
  ('fx-sub-grow-2',   'fx-user-grow-2',   'pro',   'trialing', now() + interval '5 days'),
  ('fx-sub-grow-off', 'fx-user-grow-off', 'pro',   'canceled', now() - interval '3 days'),
  ('fx-sub-prime-1',  'fx-user-prime-1',  'elite', 'active',   now() + interval '10 days');

-- Coaches: one demo id the migration recognises, two others with their own commission and prices.
INSERT INTO "professionals" ("id", "email", "passwordHash", "fullName", "commissionPct", "updatedAt") VALUES
  ('coach-alex-rivera', 'fx-alex@fynrox-upgrade.invalid',  'x', 'TEST-ONLY demo coach id',        20, now()),
  ('fx-coach-25',       'fx-coach25@fynrox-upgrade.invalid','x', 'TEST-ONLY coach, 25% commission', 25, now()),
  ('fx-coach-20',       'fx-coach20@fynrox-upgrade.invalid','x', 'TEST-ONLY coach, default commission', 20, now());

INSERT INTO "professional_service_offerings" ("id", "professionalId", "serviceType", "label", "durationMinutes", "priceCents", "updatedAt") VALUES
  ('fx-off-alex', 'coach-alex-rivera', 'fitness',   'TEST-ONLY fitness',   45, 120000, now()),
  ('fx-off-25',   'fx-coach-25',       'fitness',   'TEST-ONLY fitness',   45, 150000, now()),
  ('fx-off-20',   'fx-coach-20',       'nutrition', 'TEST-ONLY nutrition', 30,  90000, now()),
  ('fx-off-20c',  'fx-coach-20',       NULL,        'TEST-ONLY combined',  60, 200000, now());

INSERT INTO "bookings" ("id", "userId", "professionalId", "offeringId", "scheduledAt", "durationMinutes", "priceCents") VALUES
  ('fx-booking-1', 'fx-user-booker', 'fx-coach-25', 'fx-off-25', now() + interval '2 days', 45, 150000);

INSERT INTO "payments" ("id", "userId", "purpose", "referenceId", "amountCents", "discountCents", "providerOrderId", "status", "updatedAt") VALUES
  ('fx-pay-booking', 'fx-user-booker', 'booking',      'fx-off-25', 140000, 10000, 'fx_order_booking', 'paid', now()),
  ('fx-pay-grow',    'fx-user-grow-1', 'subscription', 'pro',       49900,  NULL,  'fx_order_grow',    'paid', now());

COMMIT;
