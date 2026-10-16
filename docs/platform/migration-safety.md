# Migration safety — inventory and proposed path (Batch 0, 16 Oct 2026)

Status: **proposal only.** Nothing here has been run against any database.
Every database statement below needs separate approval before it touches a
real environment.

## 1. Hosting targets

| Target | Evidence | Active? | How schema changes reach it |
|---|---|---|---|
| Azure App Service + Azure Postgres (`centralindia`) | `AZURE-DEPLOY-RUNBOOK.md` ("Azure is now the live plan", 3 Sep 2026); `apps/user-mobile/eas.json` points the app at `primefit-api-zjcprljmiu7mq.azurewebsites.net`; `.github/workflows/deploy-azure-api.yml` | **Yes**: the user-app build talks to it | `deploy-azure-api.yml` (manual `workflow_dispatch`, any branch) runs `prisma migrate deploy` before building, with no test gate and no backup step |
| Render web service + Render Postgres (`oregon`) | `render.yaml`; `DEPLOY-RUNBOOK.md` calls it a fallback | **Unknown**: can't be seen from the repo. Check the Render dashboard for a `fynrox-api` service or `primefit-db` database | Was `prisma db push --accept-data-loss` on every deploy. **Now a read-only `prisma migrate status`** (Batch 0), so a deploy stops instead of changing the database |
| Local / CI | `docker-compose.yml` (Postgres only), `.github/workflows/ci.yml` (throwaway `postgres:16` service) | Yes | `prisma migrate deploy` against a disposable database |

Render is kept in place (not deleted) until its usage is confirmed.

## 2. Migration history

- 51 entries in `apps/api/prisma/migrations` (50 migrations plus `migration_lock.toml`), from `20260831081213_init`.
- Four migrations exist **only on `blueprint-p1-p2`** (not on `origin/main`). Whether any of them has already been applied to Azure is **unknown**: the Azure deploy workflow can be started from any branch. Check `_prisma_migrations` on the Azure database (read-only) before deciding anything.

### Pending SQL review (the four branch-only migrations)

| Migration | Schema change | Data it changes or deletes | Risk |
|---|---|---|---|
| `20261015100000_adults_only_remove_guardian` | Drops the `guardian_reviews` table and the `GuardianReviewStatus` type | **Deletes all guardian review rows** | Irreversible. The folder name and comment still say "adults 18+ only", which conflicts with the later no-age-limit decision |
| `20261015110000_admin_roles_mfa_approvals` | Recreates the `AdminRole` enum; adds MFA and approval tables | Maps old roles to new ones (anything other than super_admin, finance or support becomes `operations`) | **Sets the default admin role to `super_admin`**: any admin row inserted without an explicit role gets full privileges |
| `20261015120000_plans_grow_prime_price_schedule` | Renames tiers pro→grow and elite→prime; adds `quarterly`; adds `subscriptions.priceCents`; adds `plan_price_changes` | **Sets live plan prices to ₹299 / ₹599**, switches off the yearly plans, **inserts the ₹349 Grow price increase for 1 Dec 2026**, and **sends an in-app notice to every current Grow subscriber** | Applying it to production activates a business-policy change and contacts real users. Its own comment calls these values "test data only" |
| `20261015130000_coach_levels_fees_commission` | Adds coach levels, services, level fees and commission rates | **Drops `professional_service_offerings.priceCents`** (each coach's own price) and `professionals.commissionPct` (carried into overrides only when it isn't 20%). Seeds test fees and a 20% default. Gives levels only to three demo coach ids | **Every real coach's price is deleted, and real coaches get no level, so they are not bookable** until an admin places them |

Earlier migrations with data-changing statements: `20260920083029_professional_lifecycle` and `20260920144004_relationship_updated_at` (`UPDATE`s only; not reviewed further in this batch).

## 3. Proposed safe path (needs your approval at each numbered step)

1. **Look, don't touch.** From a trusted machine, run `npx prisma migrate status --schema=apps/api/prisma/schema.prisma` against each real database (Azure; Render if it exists). Save the output. Read-only.
2. **Backup and restore drill.** Take a point-in-time restore (Azure) or `pg_dump`. Restore it into a throwaway database and confirm row counts. No production writes.
3. **Rehearse on the copy.** Run `prisma migrate deploy` against the restored copy. Check the business data afterwards (plan prices, scheduled changes, notifications, coach fees and levels).
4. **Separate business data from schema.** The price, fee, commission, notification and demo-coach statements in the two Package 3/4 migrations are business decisions, not schema. If step 1 shows they have **not** been applied anywhere, edit them out of the migrations and move them to an approved admin action or seed. If they **have** been applied, leave the files alone and write corrective data changes, each approved separately.
5. **Render, only if it exists.** It was built with `db push`, so it has no migration table, and `migrate status` will now block deploys. Baseline it: compare with `prisma migrate diff --from-url "$RENDER_DATABASE_URL" --to-migrations apps/api/prisma/migrations --shadow-database-url <throwaway>`. Only if they match, run `prisma migrate resolve --applied <name>` for each migration.
6. **Gate the Azure deploy.** Proposed, not done: require a green CI run for the commit, take a backup before `migrate deploy`, and check the database in `/health` (today it doesn't touch the database).

## 4. Rollback reality

Rolling back code (Render "Rollback", redeploying an older ref on Azure) **never rolls back the database**. Migrations here only go forward, and the four above delete data. A database rollback means restoring a backup. That is why steps 1–3 come first.
