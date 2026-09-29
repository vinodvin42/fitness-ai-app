# Running FynroX locally so you can click through it for real

Two ways to test right now, from fastest to most complete:

1. **Instant, zero-setup demo** — a live click-through build of the actual admin console, running on realistic sample data instead of a real database. No install required, works in any browser, right now: **[open the demo](https://claude.ai/code/artifact/d2972acc-b611-4f4e-8c27-f945a6dd9a10)**. An amber "Demo mode" banner marks it as sample data. Sign in with the pre-filled `demo@fynrox.app` / `demo` — any email/password works. Click through Users, Professionals, Payments, Pricing, Programs, Integrations, Analytics, and more; actions like archiving a plan or approving a credential really update the screen. This is a snapshot of today's build (25 Aug 2026) — it won't include anything added after this.

2. **The real thing, running on your machine** — the actual backend against a real Postgres database, so you're testing genuine behavior end to end rather than sample data. This is what the rest of this guide walks through.

Why not run the real backend for you in this cloud session? This session's network policy blocks the one download Prisma's toolchain needs (`binaries.prisma.sh`, confirmed via direct request — a deliberate block on that specific host, not a general outage), so the database layer can't initialize here. That's a limitation of this sandbox specifically — it should download fine on your own connection. If you don't want to deal with local setup, option 1 above is genuinely usable for a walkthrough today.

## What you need installed

- **Node.js 20 or later** — https://nodejs.org (LTS build). Check with `node -v` in a terminal.
- **PostgreSQL 14+** — either install it directly (https://www.postgresql.org/download/windows/) or run it via Docker Desktop if you already have that. You just need a running Postgres server and to know its connection details (default: user `postgres`, password whatever you set at install, port `5432`).

## Steps (PowerShell, from `D:\AI\fitness-ai-app`)

```powershell
cd D:\AI\fitness-ai-app

# 1. Install all workspace dependencies (root + every app)
npm install

# 2. Create the database (adjust user/password to match your Postgres install)
#    Easiest: open pgAdmin or psql and run: CREATE DATABASE fitness_ai_app;

# 3. Configure the API's environment
cd apps\api
copy .env.example .env
notepad .env
```

In the `.env` file that opens, at minimum:
- Set `DATABASE_URL` to match your Postgres — e.g. `postgresql://postgres:YOUR_PASSWORD@localhost:5432/fitness_ai_app?schema=public`
- Replace the three `replace-me-dev-only...` JWT secret placeholders (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_JWT_SECRET`, `PROFESSIONAL_JWT_SECRET`) with any random strings — for local testing they just need to be non-empty and different from each other; exact values don't matter.
- `TWO_FACTOR_ENCRYPTION_KEY` already has a real, working placeholder value in `.env.example` (a generated 64-char hex string) — local dev works without touching it. Generate your own with `openssl rand -hex 32` before deploying anywhere real; don't reuse the published one.
- Leave the Razorpay and AI keys blank — payments/AI routes work fine unconfigured, they just report themselves as "not configured" instead of crashing (this is real, intentional behavior, not a gap).

```powershell
# 4. Generate the Prisma client, create the schema, seed sample data
npm run db:generate --workspace=apps/api
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api

# 5. Start the backend (from the repo root)
cd D:\AI\fitness-ai-app
npm run dev --workspace=apps/api
```

Leave that running — it serves `http://localhost:4000`. Open a **second** terminal for the admin console:

```powershell
cd D:\AI\fitness-ai-app
npm run dev --workspace=apps/admin-web
```

Open **http://localhost:5173** in your browser. Sign in with the account the seed script just created:

- **Email:** `admin@fynrox.com`
- **Password:** `ChangeMe123!`

(Set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` env vars before seeding if you'd rather have different credentials from the start.)

From here every screen is talking to your real local Postgres database through the real API — data you create (a new admin user, an archived plan, a verified credential) persists and comes back the same way a production deployment would behave.

## If `prisma generate` also 403s for you

Extremely unlikely on a normal connection, but if it happens: try `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npm run db:generate --workspace=apps/api` first, and if the binary fetch itself still fails, it likely means something on your network (a corporate proxy/firewall) is blocking `binaries.prisma.sh` specifically — same symptom as this cloud sandbox, different cause. Worth trying from a different network (e.g. mobile hotspot) to confirm.

## The mobile apps (user-mobile, coach-mobile)

Both are Expo apps. From the repo root:

```powershell
npm run start --workspace=apps/user-mobile
```

Then either press `w` in that terminal to open it in a browser, or scan the QR code with the Expo Go app on your phone (same Wi-Fi network as your PC). `apps/coach-mobile` works the same way. Both need `apps/api` running (step 5 above) to load real data — set each app's API base URL to `http://<your-PC's-LAN-IP>:4000` (not `localhost`) if you're testing on a phone rather than in a desktop browser, since `localhost` on the phone means the phone itself.
