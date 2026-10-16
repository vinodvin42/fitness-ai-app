# Connectivity journeys (local, isolated)

**Status: prepared, not executed.** The sandbox these files were written in
has no npm registry access and no Prisma engines, so the journeys have not run
anywhere yet. Until they run, every cross-app finding remains source-level.

These journeys check the API end to end on a disposable database, using the same
endpoints each surface calls. They test the API, its database writes, and
cross-surface reads. They do **not** run the mobile apps or web portals, and
they do not contact any deployed host.

| Scenario | File | What it checks |
|---|---|---|
| A | `a-authentication.journey.ts` | Login, then own profile. Another user's ticket or request returns 404. User and coach tokens are not interchangeable. |
| B | `b-landing-application.journey.ts` | A landing-form submission is saved. Duplicate and no-consent submissions are handled. An operations admin can see it; a support admin and a user are refused. |
| C | `c-coaching.journey.ts` | Guidance request → admin match → only the matched coach sees it → accept or decline → the user's next read shows the result (no notification). Also the marketplace path. |
| D | `d-gym-equipment.journey.ts` | A gym-portal equipment update → the member's My Gym view. Gym B can't read or change gym A's data. |
| E | `e-referral-commission.journey.ts` | Creator-link signup → attribution → test payment → commission. Duplicate verify and webhook events. Forged signature. |
| F | `f-payments-access.journey.ts` | Payment → access. Cancel → access until period end → expired. No-cancel period end, and refund (current behaviour; policy blocked). The admin refund screen's request shape. |

Each step appends to `test-results/connectivity/evidence.jsonl`, recording:
- endpoints called and file paths involved;
- records written and read;
- expected and observed results;
- a verdict.

`npm run connectivity:report` turns that log into `report.md`.

Verdicts:
- **passed**: observed matched the intended behaviour.
- **failed**: it did not.
- **current-behaviour**: no agreed policy exists, so the step only records what the code does. This is not a pass.
- **blocked**: the intended criterion depends on a business decision, named in the report.

## Safety rails

1. **The environment must be isolated, or nothing runs** (`harness/isolation.ts`, checked in globalSetup and in every worker):
   - `FYNROX_CONNECTIVITY=1` and `NODE_ENV=test`;
   - `DATABASE_URL` on localhost, with a database named `fynrox_<name>_test` (the dev and CI database names are refused);
   - `PAYMENT_PROVIDER=mock`, `AI_PROVIDER=mock`, `FOOD_DATA_PROVIDER=seed`, `API_INSTANCE_COUNT=1`;
   - no SMTP, Sentry, Redis, AI-vendor or Razorpay key variables, and no Render or Azure hosting markers;
   - every JWT secret and the webhook secret starts with `test-only-`, and no two are the same.
2. **The database must carry the harness marker** (`harness/databaseGuard.ts`). `connectivity:prepare-db` only claims a database that is empty. A database with tables and no marker, such as a real or dev database, is refused before any migration or write.
3. **Test seeding stays separate.** `harness/syntheticWorld.ts` never imports `src/lib/seedDatabase.ts`:
   - Accounts are named `TEST-ONLY …` with `.invalid` email addresses.
   - Business values are labelled TEST-ONLY fixtures: a ₹1 plan, a ₹0 coach fee and a 10% creator rate. They are not proposals.
   - It does not touch the real plans, scheduled price changes, coach levels, fees or commission defaults.
4. **No external side effects.** Payments use the local HMAC mock, there is no email, push or SMS, and AI and food data use local substitutes. Your `apps/api/.env` is ignored during the run.
5. **No secrets in output.** Evidence and logs redact token- and secret-shaped strings. `world.json` holds a synthetic password for the throwaway run; it stays under the git-ignored `test-results/`.

## Running it

On Windows, after `npm ci`, use the script, which starts and removes a throwaway PostgreSQL:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\local-verify\run-connectivity.ps1
```

Manually, against any empty local PostgreSQL database named `fynrox_connectivity_test`, with the variables above set:

```bash
npm run connectivity:prepare-db --workspace=apps/api
npm run test:connectivity --workspace=apps/api
npm run connectivity:report --workspace=apps/api
```

## Isolated PostgreSQL options

These options were checked on 16 Oct 2026 by listing folder names on the PC; none were run. Nothing has been installed or provisioned.

| Option | Needs installing? | Isolation | Notes |
|---|---|---|---|
| **1. Temporary cluster from the installed PostgreSQL 17 binaries** (`C:\Program Files\PostgreSQL\17\bin`) | No | New data folder in `%TEMP%`, 127.0.0.1 only, random password, deleted afterwards | **Recommended.** This is what `run-connectivity.ps1` does. It doesn't touch the existing PostgreSQL service or its databases. |
| 2. New database on the existing local PostgreSQL 17 service | No | Same server as any local dev database | Needs that server's admin password. It is less isolated than option 1. |
| 3. Docker Desktop container | **Yes** | Strong | Docker Desktop is not installed: there is no `C:\Program Files\Docker` and no `~\.docker`. It would need installing plus WSL2 or virtualization. Not approved. |
| 4. GitHub Actions service container | No | Strong (one-off runner) | Needs the branch pushed and a workflow job added. Both need your approval. |

Azure or any other live database is never an option, and the guards refuse it.
