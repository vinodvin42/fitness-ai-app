# Migration safety: inventory, review and proposed path

Updated 16 Oct 2026 (Batch 0 close-out).

**Status: read-only review and proposal.** No database has been queried or changed, and no migration file has been edited. Every action in section 5 needs separate approval.

## 1. Hosting targets

| Target | Evidence | Active? | How schema changes reach it |
|---|---|---|---|
| Azure App Service + Azure Postgres (`centralindia`) | `AZURE-DEPLOY-RUNBOOK.md` ("Azure is now the live plan", 3 Sep 2026); `apps/user-mobile/eas.json` points at `primefit-api-zjcprljmiu7mq.azurewebsites.net`; `.github/workflows/deploy-azure-api.yml` | **Yes**: the user-app build talks to it | `deploy-azure-api.yml`: manual `workflow_dispatch` from any **pushed** branch. Runs `prisma migrate deploy` before building. No test gate, no backup step |
| Render web service + Render Postgres (`oregon`) | `render.yaml`; `DEPLOY-RUNBOOK.md` calls it a fallback | **Unknown**: check the Render dashboard for `fynrox-api` / `primefit-db` | Was `prisma db push --accept-data-loss` on every deploy. Now a read-only `prisma migrate status`, so a deploy stops instead of changing the database (Batch 0) |
| Local / CI | `docker-compose.yml`, `.github/workflows/ci.yml` | Yes | `prisma migrate deploy` against a throwaway database |

## 2. Exact inventory

`apps/api/prisma/migrations` holds **51 entries: 50 migration folders plus `migration_lock.toml`.** Each folder has one `migration.sql`. (The earlier audit said "51 migrations"; that was wrong.)

| Where | Migrations | Notes |
|---|---|---|
| `origin/main` (`909a7b6`) | 46 | Newest: `20261009100000_figma_v1_features` |
| `blueprint-p1-p2` (this branch, not on GitHub) | 50 = main's 46 + 4 | The 4 are listed in section 4. Main's 46 are byte-identical here |
| `origin/figma-v1-ui` (`069d715`, 7 Oct) | 47 | **Diverges from main.** It has 12 migrations main lacks (`20261006090000_figma_v1_gap_features` … `20261008090000_profile_settings_gym_member`) and lacks 11 that main has (`20260928184151_r1_ledgers_privacy_lifecycle_states` … `20260928223345_partner_application_action_item`, plus `20261009100000_figma_v1_features`). Main's `20261009100000_figma_v1_features` appears to repackage the same Figma tables, except `quote_requests`, which exists only on that branch |
| `origin/claude/ecstatic-fermat-9wf1gj` | 45 | A subset of main |

Full list (50): `20260831081213_init`, `20260903182243_admin_ticket_triage`, `20260904131818_content_images`, `20260905133735_pay01_booking_payments`, `20260914180441_plan_generation_recommendation_engine`, `20260914180530_plan_isactive_default_false`, `20260914192602_user_acquisition_context`, `20260914201302_workout_session_current_exercise_index`, `20260915093550_food_estimate_data_quality_flow`, `20260915124108_checkin_daily_weekly`, `20260915135333_payment_entitlement_activation_tracking`, `20260915135930_relationship_status_add_enum_values`, `20260915135945_relationship_state_machine`, `20260916120000_relationship_end_reason`, `20260917054248_analytics_events`, `20260918060000_subscription_status_add_enum_values`, `20260918060010_subscription_cancel_and_revoke_fields`, `20260918093058_add_password_reset_token`, `20260918093332_onboarding_schedule_equipment_baseline`, `20260918093342_consent_and_safety_escalation`, `20260919083231_credential_expires_at`, `20260920082741_gym_partner_lite`, `20260920082744_admin_action_item_queue`, `20260920082836_acquisition_source_campaign_touchpoint`, `20260920082917_backfill_acquisition_context_touchpoints`, `20260920083029_professional_lifecycle`, `20260920134436_professional_offers`, `20260920143806_add_coach_note`, `20260920143959_relationship_lifecycle_offer_proposed_by_professional`, `20260920144004_relationship_updated_at`, `20260920181028_campaign_gym_relation`, `20260921121844_gym_portal_password`, `20260921122214_influencer_portal_auth`, `20260922132022_meal_plan_generation_engine`, `20260922132134_add_mindfulness_log`, `20260928184151_r1_ledgers_privacy_lifecycle_states`, `20260928191712_guidance_requests`, `20260928191745_assignment_queue_action_item`, `20260928201619_subscription_pending_suspended`, `20260928203522_encrypt_health_data`, `20260928204936_gym_help_requests`, `20260928205041_gym_help_action_item`, `20260928210025_commission_payout_failure_reason`, `20260928223229_public_applications`, `20260928223345_partner_application_action_item`, `20261009100000_figma_v1_features`, `20261015100000_adults_only_remove_guardian`, `20261015110000_admin_roles_mfa_approvals`, `20261015120000_plans_grow_prime_price_schedule`, `20261015130000_coach_levels_fees_commission`.

## 3. Applied where? (evidence, not verification)

| Environment | Main's 46 | figma-v1-ui's 12 | The 4 branch-only migrations |
|---|---|---|---|
| Azure | **Unknown.** Depends on which branch was last deployed | **Unknown.** Possible if `deploy-azure-api.yml` was ever run from `figma-v1-ui` | **Not via the deploy workflow:** this branch was never pushed, and the workflow only deploys pushed refs. A manual `migrate deploy` from a developer machine can't be ruled out from here |
| Render | Unknown (does it exist?) | Unknown | Same reasoning as Azure |
| Your PC (`D:\repo\fitness-ai-app`) | n/a: no database, no `node_modules` | n/a | n/a |

**Why the figma-v1-ui split matters.** If Azure's `_prisma_migrations` contains the 12 `figma-v1-ui` names, then deploying `main` or this branch would try to apply `20261009100000_figma_v1_features` on top of tables that already exist. It would likely fail partway. `prisma migrate status` would also report history that is missing locally. **This has to be answered from the Azure database (read-only) before any deploy.**

## 4. Risky migrations, one by one

The project's own rule (`docs/platform/health-data-encryption.md`, "The drop"): *"An unapplied destructive migration sitting in `prisma/migrations` is applied by the next `prisma migrate deploy` anyone runs."* All four branch-only migrations are in exactly that position.

### 4.1 `20261015100000_adults_only_remove_guardian`

```sql
ALTER TABLE "guardian_reviews" DROP CONSTRAINT "guardian_reviews_userId_fkey";
DROP TABLE "guardian_reviews";
DROP TYPE "GuardianReviewStatus";
```

- **Applied:** see section 3. Not on any pushed branch.
- **Data affected:** every guardian-review row is deleted permanently. These may hold guardian contact details and consent decisions about minors.
- **Business decision embedded:** the header says "FynroX is for adults 18+ only". That was later reversed (commit `f01613d`, no age limit), but this migration still removes the guardian flow.
- **Proposed correction (needs approval; only valid if section 3 confirms it is unapplied everywhere):**
  - Replace the `DROP TABLE` with `ALTER TABLE "guardian_reviews" RENAME TO "guardian_reviews_archived_20261015"`, keeping the rows until a retention decision is made.
  - Correct the header comment.
  - Alternatively, export the table before applying.
- **Recovery:** once dropped, only a backup restore brings the rows back. Take a verified backup first.

### 4.2 `20261015110000_admin_roles_mfa_approvals`

```sql
CASE "role"::text WHEN 'super_admin' THEN 'super_admin' WHEN 'finance' THEN 'finance'
  WHEN 'support' THEN 'support' ELSE 'operations' END
ALTER TABLE "admin_users" ALTER COLUMN "role" SET DEFAULT 'super_admin';
```

- **Permissions affected:**
  - `user_operations`, `coach_operations`, `content`, `growth` and `analytics` admins all become `operations` and gain whatever that role allows.
  - **Any admin row inserted without an explicit role becomes `super_admin`**, the highest privilege.
- **Business decision embedded:** the role mapping (decision D15/D21).
- **Proposed correction:** set the default to the least-privileged role (`support`), or remove it. Confirm first that every code path creating admins passes a role. List current admins and their mapped roles before applying.
- **Recovery:** role changes are reversible by hand if the old values are recorded first. Export `admin_users (id, email, role)` before applying.

### 4.3 `20261015120000_plans_grow_prime_price_schedule`

```sql
UPDATE "subscription_plans" SET "name" = 'Grow', "priceCents" = 29900 WHERE "id" = 'pro';
UPDATE "subscription_plans" SET "name" = 'Prime', "priceCents" = 59900 WHERE "id" = 'elite';
INSERT INTO "plan_price_changes" (...) VALUES ('seed-grow-349-2026-12-01', 'pro', 34900, 29900, '2026-11-30T18:30:00.000Z', ...);
INSERT INTO "notifications" (...) SELECT ... 'From 1 December 2026, Grow will be ₹349 per month ...' FROM "subscriptions" WHERE "planId" = 'pro' AND "status" IN ('active','trialing','past_due');
```

- **Data affected:**
  - Live plan prices are overwritten.
  - Existing subscriptions get `priceCents` backfilled from their current plan price. That part is safe and wanted.
  - Yearly plans are switched off.
- **Business decisions embedded** (the same file calls the prices "test data only"):
  - prices of ₹299 / ₹599;
  - the ₹349 increase effective 1 Dec 2026;
  - **an in-app notification to every current Grow subscriber.**
- **Proposed correction:**
  - Keep the schema parts: enum renames, the `quarterly` value, the `priceCents` column and its backfill, and the `plan_price_changes` table.
  - Move steps 4, 6 and 7 (prices, the scheduled increase, the notice) out of the migration. Run them as separately approved admin actions.
- **Recovery:** prices and the schedule are reversible by admin action, but **sent notifications cannot be unsent.** The schema renames are hard to undo without a backup.

### 4.4 `20261015130000_coach_levels_fees_commission`

```sql
INSERT INTO "coach_level_fees" ... (180000, 120000, 250000, 200000, 150000, 300000, 250000, 180000, 380000)
INSERT INTO "commission_rates" ... ('commission-default-start', NULL, 20, ...)
UPDATE "professionals" SET "coachLevelId" = 'level-1' WHERE "id" IN ('coach-alex-rivera', 'coach-priya-nair');
UPDATE "bookings" SET "commissionPct" = 20 WHERE "commissionPct" IS NULL;
ALTER TABLE "professional_service_offerings" DROP COLUMN "priceCents";
ALTER TABLE "professionals" DROP COLUMN "commissionPct";   -- after carrying non-20% values into overrides
```

- **Data affected:**
  - **Every coach's own service price is deleted.**
  - Each coach's commission column is dropped. Only values other than 20% are kept, as overrides.
  - Only the three demo coach ids get a level, so **real coaches end up with no level and can't be booked.**
  - Past bookings get `commissionPct` (copied from the coach, otherwise 20) and GST 0.
- **Business decisions embedded:** level names, nine level fees, the 20% FynroX commission, the three services and their durations. All are labelled "test data".
- **Proposed correction:**
  - Rename `priceCents` to `legacyPriceCents` instead of dropping it, until the fee model is approved.
  - Move fee, commission and demo-coach assignments to an approved seed or admin action.
  - Keep the schema and the historical booking backfill.
- **Recovery:** dropped columns come back only from a backup. Export `professional_service_offerings (id, priceCents)` and `professionals (id, commissionPct)` first.

### 4.5 Data-changing migrations already on main (lower risk)

- `20260920083029_professional_lifecycle`: sets `professionals.lifecycleStatus` from verified credentials. Derived and deterministic.
- `20260920144004_relationship_updated_at`: `UPDATE relationships SET updatedAt = createdAt WHERE updatedAt IS NULL`. Harmless.

## 5. Proposed safe path (each numbered step needs your approval)

1. **Look, don't touch.** From a trusted machine, read Azure's `_prisma_migrations` (`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at;`) and run `npx prisma migrate status`. Read-only. This answers sections 3 and the figma-v1-ui question.
2. **Backup and restore drill.** Take an Azure point-in-time restore or `pg_dump`. Restore it into a throwaway database and compare row counts.
3. **Rehearse on the copy.** Run `prisma migrate deploy` against the restored copy. Check plan prices, scheduled changes, notifications, coach fees and levels, and admin roles.
4. **Correct the four migrations, only if step 1 shows they're unapplied everywhere,** as proposed in 4.1–4.4. If any is already applied, leave its file alone and write corrective forward migrations instead, each approved.
5. **Render, only if it exists:** baseline it. Check `prisma migrate diff --from-url "$RENDER_DATABASE_URL" --to-migrations apps/api/prisma/migrations --shadow-database-url <throwaway>` first, then run `prisma migrate resolve --applied <name>`.
6. **Gate the Azure deploy (proposal):** require a green CI run, take a backup before `migrate deploy`, and check the database in `/health`.

## 6. Rollback reality

Rolling back code never rolls back the database. Migrations here only go forward, and four of them delete or rewrite data. Database rollback means restoring a backup, which is why steps 1–3 come first.

## 7. Sandbox evidence, 16 Oct 2026 (direct SQL, not Prisma Migrate)

**How it was run.**
- **Tool:** `psql -X -v ON_ERROR_STOP=1 -q -f <migration.sql>`, one migration at a time in folder order, on a throwaway PostgreSQL 16.15 cluster bound to 127.0.0.1.
- **Not Prisma Migrate.** Prisma's engines cannot be downloaded in that sandbox, so this was direct SQL. No `_prisma_migrations` history and no checksums were recorded, and Prisma's own checks (drift, failed-migration state, P3005) did not run.
- **Different PostgreSQL major version.** Azure's version is not known here, and the PC has PostgreSQL 17 binaries.
- **Not evidence for the Prisma workflow.** `scripts/local-verify/verify-migrations.ps1` repeats both checks through `prisma migrate deploy` / `migrate status` on the PC. Until that runs, the Prisma path is unverified.

**Fresh install** (empty database, all 50 branch migrations): 50 applied, 0 failed, 102 tables.

**Upgrade from main.** The steps were:
- apply main's 46 migrations;
- load `scripts/local-verify/migration-upgrade/fixture-main.sql` (synthetic TEST-ONLY data);
- run the read-only `snapshot.sql`;
- apply the 4 branch-only migrations;
- run `snapshot.sql` again.

Fixture loading succeeded (exit 0) and is reported separately from the migrations. All 4 migrations applied with 0 failures.

| Migration | Observed on the synthetic data |
|---|---|
| `adults_only_remove_guardian` | `guardian_reviews` table dropped together with its row. The under-18 user remains, with no guardian record. |
| `admin_roles_mfa_approvals` | `analytics`, `content`, `growth`, `user_operations` and `coach_operations` admins **all became `operations`**. For the analytics and content admins this likely widens access: `operations` can view users, professionals, relationships, gyms and growth data, and can raise changes there, most of which apply only after Super Admin approval. What those roles could do on main was not compared. `super_admin`, `finance` and `support` were unchanged. |
| `plans_grow_prime_price_schedule` | `pro` → Grow ₹299 and `elite` → Prime ₹599, overwriting the fixture's ₹499 and ₹999. Annual plans were switched off. Existing subscriptions were locked at their old price (`priceCents` 49900 / 99900). A ₹299 → ₹349 change was scheduled for 2026-11-30T18:30Z with `noticeSentAt` set. **Two "Grow price change" notifications were inserted** (for the active and the trialing Grow subscribers). The notice says "₹349", but those subscribers are locked at ₹499 in this data. |
| `coach_levels_fees_commission` | Every coach offering's `priceCents` was **dropped** (₹1,200 / ₹1,500 / ₹900 / ₹2,000 lost). The `commissionPct` column was dropped; the 25% coach was carried into `commission_rates`, and the 20% coaches rely on the default. Only the demo id `coach-alex-rivera` got a level, so **`fx-coach-25` and `fx-coach-20` have no level**. Existing bookings got `commissionPct` 25 and `gstCents` 0. The booking payment got `feeCents` = amount + discount (₹1,500) and `taxCents` 0. |

The logs and before/after snapshots are in the session's scratch evidence folder. The fixture and snapshot files are committed so the same run can be repeated with Prisma on the PC.
