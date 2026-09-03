# Deploy runbook — PrimeFit go-live

Written 25 Aug 2026 as part of go-live hardening. This turns "first real
deploy attempt" from an open-ended task into a fixed checklist. Three
services, three targets:

| Service | What it is | Deploys to | Config file |
|---|---|---|---|
| `apps/api` | Shared backend | Render (Node web service + managed Postgres) | `render.yaml` |
| `apps/admin-web` | Admin console | Vercel (static Vite build) | `apps/admin-web/vercel.json` |
| `apps/user-mobile` | Consumer app, web build | Vercel (static Expo web export) | `apps/user-mobile/vercel.json` |

`apps/coach-mobile` is **not** in this list on purpose — coach-client
matching was deferred (see `apps/api/README.md`'s Phase 5 note), so it has
nothing to serve yet.

Verified from this build before handoff: `apps/admin-web` builds clean
(`tsc --noEmit && vite build`, zero errors, real `dist/` output).
`apps/user-mobile`'s `expo export --platform web` produces a real
deployable `dist/` (confirmed the `EXPO_PUBLIC_API_BASE_URL` build-time env
var actually gets inlined into the bundle — see `src/api/client.ts`).
**Not yet verified by hand:** the API booting against a real Postgres
database — every sandbox this project has been developed in blocks
`binaries.prisma.sh` (Prisma's engine-binary host), which `prisma
generate` needs over the network. That's a sandbox-network-policy
problem, not a code problem — a normal machine or CI environment reaches
that host fine. `.github/workflows/ci.yml` now checks exactly this,
automatically, the moment step 1 pushes to GitHub — a real ephemeral
Postgres, a real `prisma generate` + `db push`, an actual boot with a
`/health` poll. Step 1 tells you to watch it before moving on; step 4 is
still real confirmation on Render's own infrastructure specifically, not
a step CI makes redundant, just one CI should make far less anxious.

---

## Running a beta/pilot first? (commercial off, ~100 users)

28 Aug 2026: decided — defer the currency/pricing call (`reports/payments-razorpay-plan.html` §02) and get a real pilot running first. Nothing below changes any other step in this runbook; it's exactly step 2's existing "leave `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` blank" instruction, spelled out for what that actually means at 100-user scale.

**Works fully, no payment step involved:** signup/onboarding, workout/nutrition/progress logging, the free Basic subscription tier (`priceCents: 0`), coach discovery, and AI Coach chat — *if* `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` is set, which is a separate, unrelated decision from Razorpay (this app's other optional integration, see `apps/api/src/lib/aiClient.ts`).

**Worth knowing before testers hit it, not after — coaching bookings are free right now regardless of price shown.** `coaching.service.ts`'s booking flow has no payment-collection step wired up yet at all (a real, pre-existing gap — see `reports/payments-razorpay-plan.html` PAY-01, not something this pilot decision changes). A tester can book any coach's session at any listed price and it confirms instantly, uncharged. Fine for a pilot; just don't read a booked session as a real transaction when reviewing results.

**Will look broken for a moment, then fail gracefully — not hidden.** Tapping "Subscribe" on Pro/Elite or "Buy" on a priced Program calls the real checkout flow, gets a real `503 payment_gateway_not_configured`, and surfaces a real `Alert.alert("Couldn't start checkout", ...)` (`useRazorpayPurchase.ts`) — not a crash, but not a great first impression for someone who doesn't know payments are intentionally off. Two ways to handle it for 100 testers: tell them up front in whatever you send out, or say the word and this becomes a small, contained follow-up — no public endpoint currently exposes Razorpay's configured state to the mobile client, so hiding the two paid CTAs cleanly needs one new small route plus a client-side check, not just a flag flip.

**Sizing:** `render.yaml`'s `starter` plan (already what the blueprint provisions — no change needed) is comfortably enough for a 100-person pilot. Rate limits (`middleware/rateLimit.ts`) are per-IP or per-user, not global, so 100 concurrent testers won't collide with each other under normal use; the one edge case worth knowing about is several testers sharing one IP (a campus/office network) sharing the write limiter's 30-requests/15-min bucket — unlikely to bite, but the explanation for a stray 429 if one ever gets reported.

---

## 0. Before you start

You'll need, in this order:

1. A GitHub repo to push this code to (empty is fine — see step 1).
2. A Render account (render.com) — free to create, the Postgres/web-service
   plans used below are Render's paid "starter" tier (their free tier
   sleeps on inactivity and has no persistent disk for a database, both
   wrong for a live app).
3. A Vercel account (vercel.com) — free tier is fine for two static sites.
4. About 20 minutes of not being interrupted for steps 1-4; steps 5-8 can
   happen whenever afterward.

## 1. Push to GitHub

No git repo exists in this project folder yet — deliberately. One was
built and verified in the sandbox this project was developed in, but that
sandbox reaches your files through a bridge that can create files and
rename them, but can't delete them; git's own locking (`.git/index.lock`,
created and removed on almost every command) needs real delete
permission, so a repo transplanted through that bridge would leave your
real `.git` folder with a stale lock the first time you touched it. Simpler
and more reliable to create it fresh, in two commands, from a real
terminal on your machine (not a sandboxed one):

```bash
cd fitness-ai-app
git init
git add -A
git commit -m "Initial commit: PrimeFit at go-live readiness"
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

`.gitignore` is already in place (`node_modules/`, `dist/`, `.env*`, etc.)
so `git add -A` won't pull in anything it shouldn't. If the GitHub repo
isn't empty (e.g. you initialized it with a README on GitHub's side), pull
first: `git pull origin main --allow-unrelated-histories`, resolve the one
likely conflict (both READMEs), then push.

**Wait for the CI check before moving on.** This push triggers
`.github/workflows/ci.yml` automatically — open the repo's **Actions** tab
and watch it run (a couple of minutes). It lints and typechecks every
workspace, then does something nothing in this project's development
history has ever gotten to see happen: spins up a real Postgres, runs
`prisma generate` and `prisma db push` against it, and actually boots the
built API to confirm `/health` responds. If that's green, step 4 below is
now much lower-risk than it would otherwise be. If it's red on the Prisma
steps specifically, that's a genuinely new problem worth stopping to
understand before spending time on Render at all — every prior failure
here was a sandbox-specific network block that a GitHub-hosted runner
shouldn't hit.

## 2. Render — API + Postgres

1. Render dashboard -> **New** -> **Blueprint** -> connect the GitHub repo
   from step 1. Render reads `render.yaml` from the repo root automatically
   and shows you two resources: `primefit-db` (Postgres) and `primefit-api`
   (web service).
2. Before clicking Apply, Render will prompt for every env var marked
   `sync: false` in `render.yaml`. Generate real values now:
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_JWT_SECRET`,
     `PROFESSIONAL_JWT_SECRET` — run `openssl rand -base64 48` four
     separate times, once per secret. **They must all be different from
     each other** — that's a deliberate design constraint (see
     `apps/api/src/config/env.ts`), not an oversight.
   - `TWO_FACTOR_ENCRYPTION_KEY` (25 Aug 2026, gap §17) — run
     `openssl rand -hex 32` once. Unlike the four secrets above, this MUST
     be exactly 64 hex characters (32 raw bytes — AES-256-GCM's fixed key
     size); `openssl rand -base64 48` will NOT pass validation here. The
     API refuses to boot without a real one, same as the JWT secrets — see
     `apps/api/src/config/env.ts`.
   - `CORS_ORIGINS` — leave blank for now, you don't have the Vercel URLs
     yet. Come back and fill this in after step 3 (comma-separated, no
     spaces: `https://admin.yourdomain.com,https://app.yourdomain.com`).
     The API will refuse to boot without this once you set it live —
     that's intentional, not a bug.
   - `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
     — leave blank until you've made the currency call (see this repo's
     go-live plan artifact, item 1). Blank means payments return a clean
     503 instead of crashing — the app is otherwise fully usable.
   - `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `AI_MODEL` — leave blank,
     nothing in this build reads them yet.
   - `SENTRY_DSN` — optional. Create a free Sentry project first if you
     want error monitoring from day one; otherwise leave blank and add it
     later (no redeploy-breaking change either way).
   - **`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — do not leave these
     blank.** Pick a real email and a strong password now. Without them,
     step 6 below seeds `admin@23primefit.com` / `ChangeMe123!` onto your
     live database — that exact credential is published in this repo's
     own `RUN-LOCALLY.md`, so it's not a placeholder you're meant to
     change later, it's a real account anyone who's read this repo could
     log into. These two vars aren't read by the running server, only by
     the one-off seed command in step 6, but setting them here means
     Render prompts for them now, before it's possible to forget.
3. Click **Apply**. Render provisions the database, then builds and
   deploys the API. Watch the build log — this is step 4's real test.
4. If step 1's CI check came back green, this step is now confirmation on
   Render's own infrastructure rather than the total unknown it would
   otherwise be. Watch for `npx prisma generate` to succeed in the build
   log and for the `preDeployCommand` (`prisma db push`) to report tables
   created, then for `/health` to return `{"status":"ok"}` once the
   service is live. A `prisma generate` failure here despite a green CI
   run would point at something specific to Render's network rather than
   the code — worth flagging either way.
5. Once healthy, copy the service's `https://primefit-api-<hash>.onrender.com`
   URL — steps 3 and beyond need it.
6. Seed the database (real admin login, sample content) by running
   Render's **Shell** tab on the service, or a **one-off Job**:
   `npm run db:seed --workspace=apps/api`. This reads the
   `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` you set in step 2 — confirm
   the log line it prints shows your real email, not
   `admin@23primefit.com`, before moving on.

## 3. Vercel — admin-web and user-mobile

Do this twice, once per app — they're two separate Vercel projects even
though they live in one repo.

**admin-web:**
1. Vercel dashboard -> **Add New** -> **Project** -> import the same
   GitHub repo.
2. Set **Root Directory** to `apps/admin-web`. Vercel detects the npm
   workspace automatically and installs from the repo root — you don't
   need to change the Install Command.
3. Framework preset: Vite (should auto-detect from `vercel.json`).
4. Add one environment variable: `VITE_API_BASE_URL` =
   `https://<your-render-api-url>` (from step 2.5).
5. Deploy. Log in with the email/password you set as
   `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` in step 2 — not the
   `RUN-LOCALLY.md` dev credentials, those are for your local machine
   only. Admin & System -> Security has a real "Change password" form —
   worth rotating the password through it once, right after this first
   login, purely as good practice for a credential that's about to be
   typed into a dashboard.

**user-mobile:**
1. Same flow — **Add New** -> **Project** -> same repo.
2. **Root Directory**: `apps/user-mobile`.
3. Framework preset: **Other** (it's a static Expo web export, not a
   framework Vercel has a preset for — `vercel.json` already sets the
   right build/output commands).
4. Add one environment variable: `EXPO_PUBLIC_API_BASE_URL` =
   `https://<your-render-api-url>` (from step 2.5). This is the fix that
   makes a production build point at the real API instead of `localhost` —
   see `src/api/client.ts`'s comment for how it's wired.
5. Deploy.

## 4. Close the loop on CORS

Now that both Vercel URLs exist: go back to the Render dashboard,
`primefit-api` -> **Environment**, set `CORS_ORIGINS` to both URls
comma-separated, save — Render redeploys automatically. Without this step
the API is up but both frontends will fail every request with a CORS
error, so don't skip it.

## 5. Smoke test (do this for real, on the live URLs)

1. Open the admin-web URL, log in, confirm the Executive Dashboard shows
   real (seeded) numbers.
2. Open the user-mobile URL, sign up as a new user, complete onboarding,
   log a workout set. Confirm it shows up in the admin console's Users ->
   that user's profile.
3. Hit `https://<render-api-url>/health` directly — confirm
   `{"status":"ok","env":"production"}`.
4. Trigger one rate-limited path on purpose (11 rapid login attempts with
   a wrong password) — confirm the 11th gets a 429, not a 500 or a crash.
5. If `SENTRY_DSN` is set: trigger a deliberate 500 somewhere and confirm
   it shows up in the Sentry project within a minute or two.

## 6. After the first deploy succeeds

- Generate a real migration history: from a real terminal with internet
  access, `npx prisma migrate dev --name init --schema=apps/api/prisma/schema.prisma`
  against a local or scratch database, commit the generated
  `apps/api/prisma/migrations/` folder, and switch `render.yaml`'s
  `preDeployCommand` from `prisma db push` to
  `prisma migrate deploy --schema=apps/api/prisma/schema.prisma`. `db push`
  is fine for an empty launch-day database; it's the wrong tool once real
  user data exists, because it can silently drop columns/tables on a
  schema change with no history to roll back through.
- Rotate every `sync: false` secret in `render.yaml` if any of them were
  ever pasted into chat, a screenshot, or anywhere outside Render's own
  environment-variable UI.
- Point a real domain at both Vercel projects and the Render service if
  you want `primefit.app`-style URLs instead of the generated ones —
  Vercel and Render both support this from their dashboards, no code
  changes needed.

## 7. Android APK for direct install (no Play Store)

28 Aug 2026: decided — 100-user pilot testers install `user-mobile` (and,
optionally, `coach-mobile`) as a real Android app via a shared APK link,
not through Google Play. Deliberately outside this repo's Vercel web
deploy above — same app, second distribution channel.

**What changed to make this possible.** Neither app ever targeted Android
before this pass — `app.json`'s `platforms` array was `["ios", "web"]`
only (iOS was gap §37/DEPLOY-RUNBOOK's own original target; web was
explicitly a dev-preview export, never a real platform — see
`docs/mobile/07-open-questions-gaps.md` gap §37). Both apps' `app.json`
now include `"android"` in `platforms` plus a real `android.package`
identifier (`com.primefit.usermobile` / `com.primefit.coachmobile`,
mirroring each app's existing iOS `bundleIdentifier`), and both have a new
`eas.json` with one `preview` build profile — `distribution: "internal"`,
`android.buildType: "apk"` (an installable `.apk`, not the `.aab` bundle
format Google Play requires — that distinction is exactly what keeps this
off Play Store, no separate developer account or review process). Every
plugin already in `app.json` (`expo-notifications`,
`expo-local-authentication`, `expo-image-picker`) applies its own Android
permissions automatically through Expo's config-plugin system — nothing
extra was needed there. Neither app has custom icon/splash assets
configured (pre-existing, not something this pass added) — the shared
APK will carry Expo's generic default icon until real brand assets exist,
same as the current iOS/web builds already do.

**What this doesn't touch:** no code changes, no schema changes, nothing
about the Render/Vercel deploy above. This is packaging only.

**What you run yourself — this needs a free Expo account, the same
"can't be done through me" reasoning as GitHub push/Render secrets above:**

1. `npm install -g eas-cli` (or `npx eas-cli` ahead of every command
   below, no global install needed).
2. `eas login` — your own free Expo account. Create one at expo.dev if you
   don't have one; no payment method needed for this build volume.
3. Edit `apps/user-mobile/eas.json`'s `preview.env.EXPO_PUBLIC_API_BASE_URL`
   to your real deployed Render API URL (the same value you set on both
   Vercel projects in step 3 above) — the placeholder
   `https://<your-render-api-url>` must be replaced or the APK will try to
   reach a URL that doesn't exist. Repeat for `apps/coach-mobile/eas.json`
   if you're building that app too.
4. From the repo root: `eas build --platform android --profile preview
   -e apps/user-mobile` (EAS reads the app's own `eas.json`/`app.json` from
   the directory you point it at — run from inside `apps/user-mobile` if
   your EAS CLI version doesn't support `-e`). This queues a real cloud
   build on Expo's infrastructure — no local Android SDK/Gradle needed on
   your machine — and finishes with a direct `.apk` download link
   (typically single-digit minutes on Expo's free tier, can be longer
   under load).
5. Share that link with your 100 testers. Android blocks installs from
   outside Play Store by default ("Install unknown apps") — testers will
   need to allow it for whichever app they open the link in (browser or
   file manager) the first time; this is a normal Android prompt, not a
   sign anything is wrong.
6. Repeat steps 3-5 for `apps/coach-mobile` if coaches are part of this
   pilot too.

**Not verified from here, same honesty bar as the rest of this runbook:**
no EAS build has ever actually been run for this project — this sandbox
has no Expo account to run one against, and even with one, real Android
compilation happens on Expo's cloud infrastructure, not here. The config
above is correct by direct inspection (mirrors Expo's own documented
`eas.json`/`app.json` shape for an SDK 51 managed-workflow app), but your
first `eas build` run is the real first test of it, the same category of
"expected to work, not yet confirmed" as `render.yaml`'s Postgres step
above.

## Rollback

Render keeps every previous deploy — dashboard -> **Deploys** -> pick a
prior one -> **Rollback**, one click, no data migration involved since
`db push`/`migrate deploy` are additive-only in this flow. Vercel does the
same under **Deployments** -> **Promote to Production** on any earlier
build. Neither requires touching the database directly.
