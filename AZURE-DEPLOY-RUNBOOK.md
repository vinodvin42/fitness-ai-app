# Azure deploy runbook — FynroX go-live

Written 3 Sep 2026. The product owner explicitly chose Azure over the
existing Render+Vercel path (see `DEPLOY-RUNBOOK.md`), knowing that means
new infrastructure-as-code and an unverified first deploy rather than
building on the Render path's own (also-not-yet-live) groundwork. **Azure
is the live plan from here.** `render.yaml`, `apps/admin-web/vercel.json`,
`apps/user-mobile/vercel.json`, and `DEPLOY-RUNBOOK.md` are kept exactly
as they were — a documented, working fallback, not dead files — see the
dated note at the top of `DEPLOY-RUNBOOK.md`.

Same three services, three new targets:

| Service | What it is | Deploys to | Config file(s) |
|---|---|---|---|
| `apps/api` | Shared backend | Azure App Service (Linux, Node 20) + Azure Database for PostgreSQL Flexible Server | `infra/azure/main.bicep` (+ `infra/azure/modules/*.bicep`), `.github/workflows/deploy-azure-api.yml` |
| `apps/admin-web` | Admin console | Azure Static Web App (Free tier) | Portal-configured (see step 5) — `apps/admin-web/vercel.json` is kept only as a reference for the equivalent build command/output dir |
| `apps/user-mobile` | Consumer app, web build | Azure Static Web App (Free tier) | Portal-configured (see step 5) — `apps/user-mobile/vercel.json` is kept only as a reference |

`apps/coach-mobile` is **not** in this list, same reasoning as
`DEPLOY-RUNBOOK.md`'s own documented decision — coach-client matching was
deferred, so it has nothing to serve yet. (A new `apps/landing` directory
also exists in this working tree as of this writing, uncommitted — it
isn't part of this pass's scope either; nothing below provisions or
references it.)

## What's verified vs. not, honestly (same bar as `render.yaml`'s own comment)

- **`infra/azure/main.bicep` and its two modules compile cleanly** — `az
  bicep build --file infra/azure/main.bicep --stdout` exits 0 with zero
  errors or warnings. Confirmed in this pass, using Azure CLI 2.84.0
  (already installed) plus the Bicep CLI component (v0.46.1, installed via
  `az bicep install` — a local tool download, no login involved).
- **Every resource's property names and api-versions were cross-checked
  live against Microsoft Learn's Bicep reference on 3 Sep 2026** (not just
  recalled from training data) — `Microsoft.DBforPostgreSQL/flexibleServers`
  at `2024-08-01` and `Microsoft.Web/sites`/`serverfarms` at `2025-03-01`,
  both confirmed as the current stable (non-preview) GA versions as of
  that check, with the exact property shapes this template uses. See each
  `.bicep` file's own top comment for the sources.
- **The GitHub Actions workflow YAML parses correctly** (checked with
  Python's `yaml.safe_load`) and its action versions (`azure/login@v2`,
  `azure/webapps-deploy@v3`) and inputs (confirmed `azure/webapps-deploy`'s
  `resource-group-name` input is optional, `app-name` alone is enough)
  were checked against their current published docs on 3 Sep 2026.
- **4 Sep 2026: all of this is now real, and the paragraph that used to
  sit here is gone.** It said `az login` had never been run, that no
  resource in this runbook had ever been created, that no GitHub secret
  from step 3 existed, and that the deploy workflow had never executed.
  All four became untrue on 3–4 Sep 2026. What actually exists now, in
  resource group `rg-primefit-prod`:

  | What | Resource | Reachable at |
  |---|---|---|
  | API | App Service `primefit-api-zjcprljmiu7mq` | `https://primefit-api-zjcprljmiu7mq.azurewebsites.net` |
  | Database | Postgres Flexible Server `fynrox-pg-zjcprljmiu7mq` | (private, via the firewall rule in step 3) |
  | Landing + admin | Static Web App `fynrox-admin-web` | `https://purple-sea-0edcdc910.6.azurestaticapps.net` (landing at `/`, admin at `/app/`) |
  | Coach app | Static Web App `primefit-user-mobile` | `https://calm-ground-04d678410.3.azurestaticapps.net` |

  Note the second Static Web App's name is a leftover: it is called
  `primefit-user-mobile` but serves **coach-mobile**. Renaming it would
  mean re-linking the resource and rotating its deploy token for a purely
  cosmetic gain, so it was left alone — see that workflow's own comment.
  Consumers get `apps/user-mobile` as an Android APK from the landing
  page, not as a website.

  `deploy-azure-api.yml` has run to green repeatedly, including its
  `prisma migrate deploy` step and its post-deploy `/health` check, and
  every step-3 secret exists. **Step 1 is therefore no longer the first
  test of this file** — it is now a rebuild-from-scratch procedure, and
  the parts of it that were only ever reasoned about have since been run.
- One thing genuinely *more* certain here than the Render path ever was:
  `apps/api/prisma/migrations/` now has real, committed migration history
  (it didn't yet when `render.yaml`/`DEPLOY-RUNBOOK.md` were written) — see
  step 4's note. That's why this path uses `prisma migrate deploy` from
  day one instead of `db push`.

---

## 0. Before you start

You'll need, in this order:

1. **An Azure subscription** with rights to create resource groups and
   role assignments in it (Owner, or Contributor + User Access
   Administrator — you need to grant a service principal Contributor
   access in step 3).
2. **Azure CLI**, logged in (`az login`) with the right subscription
   selected (`az account set --subscription "<name-or-id>"`). This pass
   used `az` 2.84.0; anything reasonably recent should work. You do **not**
   need the Bicep CLI installed by hand — `az bicep build`/`az deployment
   group create` install it automatically the first time they need it, the
   same way this pass's `az bicep install` did.
3. **The GitHub repo already exists and is pushed** — confirmed in this
   working tree: `origin` is `https://github.com/vinodvin42/fitness-ai-app.git`,
   branch `main`. If that's ever stale (fork, rename, different remote),
   substitute your own `<owner>/<repo>` everywhere step 3 references one.
4. **The `gh` CLI** (optional but convenient) for setting repository
   secrets and triggering `workflow_dispatch` from a terminal instead of
   the GitHub web UI. Everything below shows both the `gh`/`az` command and
   says where the equivalent lives in each web UI.
5. **About 40-50 minutes, uninterrupted**, for steps 1-4 (provisioning,
   secrets, OIDC setup, first deploy). Steps 5-9 (the two Static Web Apps
   onward) can happen whenever afterward, same as the existing runbook's
   own pacing.

---

## 1. Provision the infrastructure (Bicep)

**1.1 Create the resource group.** Everything below lives in one resource
group so it can be inspected/torn down as a unit:

```bash
az group create --name rg-primefit-prod --location centralindia
```

`centralindia` is `infra/azure/main.bicep`'s own default (a reasonable
guess given Razorpay/INR's presence elsewhere in this app — nothing here
depends on that region specifically). Pick whatever region is actually
closest to your users; pass `--location` here to match, and either edit
`infra/azure/main.parameters.json`'s `location` value or add
`--parameters location=<your-region>` to the deploy command in 1.5.

**1.2 Generate the Postgres admin password.** Deliberately plain
alphanumeric (mixed-case + digits), not the `openssl rand -base64 …`
pattern used everywhere else in this app's secrets — a base64 password can
contain `/`, `+`, `=`, which would need URL-encoding inside `DATABASE_URL`
and is exactly the kind of easy-to-get-wrong detail worth avoiding
outright rather than debugging later. Mixed-case-plus-digits alone still
satisfies Postgres Flexible Server's "3 of 4 character categories" password
policy without needing a 4th (non-alphanumeric) category at all:

```bash
PGPASS=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)
echo "$PGPASS"
```

**Save this somewhere real (a password manager) right now.** You need it
again in 1.5, and to build `DATABASE_URL` for a GitHub secret in step 3 —
Bicep deliberately never outputs the full connection string (see
`main.bicep`'s own comment), so this is the only place it exists in plain
text.

**1.3 (Optional) validate the template yourself first**, same command this
pass used:

```bash
az bicep build --file infra/azure/main.bicep --stdout > /dev/null
```

Clean exit, no output, means it's still syntactically valid. This does
**not** touch your subscription — pure local compilation.

**1.4 Deploy:**

```bash
az deployment group create \
  --resource-group rg-primefit-prod \
  --name primefit-main \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/main.parameters.json \
  --parameters postgresAdminPassword="$PGPASS"
```

Expect several minutes — the Postgres Flexible Server is the slow part
(commonly 5-10 minutes). Watch for `"provisioningState": "Succeeded"` at
the end. If it fails on an api-version error specifically, see the
relevant `.bicep` file's own comment for the `az provider show` command to
find the current one.

**1.5 Capture the outputs you'll need for every step below:**

```bash
az deployment group show \
  --resource-group rg-primefit-prod \
  --name primefit-main \
  --query properties.outputs
```

Write down `webAppName`, `webAppDefaultHostName`, and `postgresServerFqdn`
— every step from here on refers back to these three values.

---

## 2. Set the API's environment variables (secrets)

This is the Azure equivalent of Render's Blueprint-apply-time prompts for
every `sync: false` var in `render.yaml` — except Bicep deliberately does
**not** set any of these (see `infra/azure/modules/appService.bicep`'s own
comment on why), so nothing below happens automatically just because step
1 succeeded. **Do this before step 4** (the first real GitHub Actions
deploy) — otherwise the API's very first real boot crash-loops on a
missing required var instead of coming up clean.

Every variable below is cross-checked against
`apps/api/src/config/env.ts`'s actual Zod validation schema — nothing here
is invented, and nothing that schema requires is left out. Generate every
value fresh; never reuse anything from `apps/api/.env.example`, which is
committed to the repo and therefore public.

**Already set, no action needed here** — `infra/azure/modules/appService.bicep`
set these directly at provisioning time (step 1), each matching
`.env.example`'s own default: `NODE_ENV=production`, `JWT_ACCESS_TTL_MIN=15`,
`JWT_REFRESH_TTL_DAYS=30`, `ADMIN_JWT_ACCESS_TTL_MIN=480`,
`PROFESSIONAL_JWT_ACCESS_TTL_MIN=15`, `PROFESSIONAL_JWT_REFRESH_TTL_DAYS=30`,
`RAZORPAY_CURRENCY=INR`, `PRICE_CURRENCY_CONFIRMED=false`,
`AI_PROVIDER=anthropic`, plus `DATABASE_URL` (built from the Postgres
module's own output) and a placeholder `CORS_ORIGINS` (fixed in step 6).
**Deliberately never set at all, on either platform:** `PORT` —
Azure's Linux Node runtime injects its own `PORT` env var and
`config/env.ts`/`index.ts` already read `process.env.PORT`, so setting one
ourselves would be redundant at best. That accounts for every var in
`.env.example` except the ones below.

**2.1 The four JWT secrets — generate each separately, confirm they're
actually different from each other** (a deliberate design constraint, see
`env.ts` — not an oversight):

```bash
JWT_ACCESS_SECRET=$(openssl rand -base64 48)
JWT_REFRESH_SECRET=$(openssl rand -base64 48)
ADMIN_JWT_SECRET=$(openssl rand -base64 48)
PROFESSIONAL_JWT_SECRET=$(openssl rand -base64 48)
```

**2.2 `TWO_FACTOR_ENCRYPTION_KEY`** (25 Aug 2026 gap §17) — encrypts
`User.twoFactorSecret` at rest. Unlike the four secrets above, this **must**
be exactly 64 hex characters (32 raw bytes — AES-256-GCM's fixed key
size); `openssl rand -base64 48` will **not** pass `env.ts`'s validation
here:

```bash
TWO_FACTOR_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

**2.3 `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — do not skip these.**
These two are **not** in `env.ts`'s schema at all (they're read directly
via `process.env` by `apps/api/scripts/seed.ts`, not validated at server
boot — same as `render.yaml`'s own comment on this exact pair). Without
real values, running the seed script (step 4) seeds
`admin@fynrox.com` / `ChangeMe123!` onto your live database — a
credential published in this repo's own `RUN-LOCALLY.md`, not a
placeholder you're meant to rotate later. Pick a real email and a strong
password now:

```bash
SEED_ADMIN_EMAIL="you@yourdomain.example"
SEED_ADMIN_PASSWORD="<a real strong password, not the RUN-LOCALLY.md one>"
```

**2.4 Apply everything from 2.1-2.3 in one command** (replace
`<webAppName>` with step 1.5's output):

```bash
az webapp config appsettings set \
  --resource-group rg-primefit-prod \
  --name <webAppName> \
  --settings \
    JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" \
    JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
    ADMIN_JWT_SECRET="$ADMIN_JWT_SECRET" \
    PROFESSIONAL_JWT_SECRET="$PROFESSIONAL_JWT_SECRET" \
    TWO_FACTOR_ENCRYPTION_KEY="$TWO_FACTOR_ENCRYPTION_KEY" \
    SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" \
    SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD"
```

This restarts the app automatically (App Service does this on any app
settings change) — expected, not a sign anything's wrong; there's no real
code deployed yet for it to serve regardless.

**2.5 Razorpay — leave unset, intentionally parked.** 28 Aug 2026's pilot
decision (see `DEPLOY-RUNBOOK.md`'s "Running a beta/pilot first?" section
for the full reasoning) applies exactly as-is here — nothing about the
Azure/Render choice changes it. Leaving `RAZORPAY_KEY_ID` /
`RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` unset means every payment
route returns a clean `503 payment_gateway_not_configured` instead of
crashing — the app is otherwise fully usable for a pilot. Nothing to run
in this step.

**2.6 AI Coach (optional).** `AI_PROVIDER` already defaults to
`anthropic` (set by Bicep). If you want AI Coach actually working rather
than `GET /ai/status` reporting `configured:false`, add a real key:

```bash
az webapp config appsettings set \
  --resource-group rg-primefit-prod \
  --name <webAppName> \
  --settings ANTHROPIC_API_KEY="<your real key>"
```

(or `OPENAI_API_KEY` + `AI_MODEL` + setting `AI_PROVIDER=openai` if you'd
rather use OpenAI — see `apps/api/src/lib/aiClient.ts`.)

**Using Azure OpenAI instead (recommended for this deployment path)** —
keeps AI billing on the same Azure subscription/resource group as
everything else here, instead of a separate Anthropic/OpenAI account.

1. In the Azure Portal (or `az cognitiveservices account create --kind
   OpenAI`), create an **Azure OpenAI** resource in a region that supports
   it (not every region does — check
   [Azure OpenAI's region availability](https://learn.microsoft.com/azure/ai-services/openai/concepts/models)
   before picking one; `centralindia`, this template's own default
   `location`, may not be one of them — `eastus`/`swedencentral` reliably
   are as of this writing).
2. In that resource (via **Azure AI Foundry** → **Deployments**), deploy a
   chat model — e.g. `gpt-4o-mini` — and note the **deployment name** you
   give it (not necessarily the same as the base model name).
3. From the resource's **Keys and Endpoint** page, grab Key 1 and the
   endpoint URL (`https://<resource-name>.openai.azure.com`).
4. Set the non-secret pieces via the Bicep params (re-run `az deployment
   group create` with these added, or set them the same
   `appsettings set` way as the secret below — either works, but a
   redeploy of the template will overwrite ad-hoc `appsettings set` values
   for anything the template itself defines, per this file's own note in
   `appService.bicep`):
   - `aiProvider = 'azure-openai'`
   - `azureOpenAiEndpoint = 'https://<resource-name>.openai.azure.com'`
   - `azureOpenAiDeployment = '<your deployment name>'`
5. Set the one real secret, same pattern as `ANTHROPIC_API_KEY` above —
   this one is deliberately never in the Bicep template:

```bash
az webapp config appsettings set \
  --resource-group rg-primefit-prod \
  --name <webAppName> \
  --settings AZURE_OPENAI_API_KEY="<key 1 from the resource>"
```

6. Confirm with `GET /ai/status` (any authenticated request) — it should
   report `provider: "azure-openai"`, `configured: true`, and `model:
   "<your deployment name>"`.

**2.7 Error monitoring (optional).** Create a free Sentry project first if
you want error monitoring from day one:

```bash
az webapp config appsettings set \
  --resource-group rg-primefit-prod \
  --name <webAppName> \
  --settings SENTRY_DSN="<your real DSN>"
```

Leave unset otherwise — errors still log to stdout (viewable via `az
webapp log tail`, see step 7).

**2.8 Confirm everything landed:**

```bash
az webapp config appsettings list \
  --resource-group rg-primefit-prod \
  --name <webAppName> \
  -o table
```

`CORS_ORIGINS` should still show `http://localhost:5173` at this point —
that's `appService.bicep`'s deliberate placeholder (see its own comment:
an empty `CORS_ORIGINS` makes `env.ts` refuse to boot at all in
production, so a harmless real value ships from the start instead of a
guaranteed crash-loop). Step 6 replaces it with the two real Static Web
App URLs once they exist.

---

## 3. GitHub Actions — OIDC login + repository secrets

`azure/login` via OIDC federated credentials, not a stored
publish-profile/service-principal secret — Microsoft's current
recommendation, and this is a from-scratch setup with no legacy constraint
pulling toward the simpler-but-less-secure option. No Azure credential of
any kind ends up stored as a long-lived GitHub secret with this approach —
just three non-secret identifiers (a client ID, a tenant ID, a
subscription ID), all of which are safe to have in an attacker's hands
without the corresponding federated-credential trust relationship,
because GitHub Actions itself never holds anything else to steal.

**3.1 Create an App Registration + Service Principal:**

```bash
APP_ID=$(az ad app create --display-name "fynrox-github-deploy" --query appId -o tsv)
az ad sp create --id "$APP_ID"
echo "$APP_ID"   # this is AZURE_CLIENT_ID — save it
```

**3.2 Grant it Contributor, scoped to just this resource group** (not the
whole subscription):

```bash
SUB_ID=$(az account show --query id -o tsv)
az role assignment create \
  --assignee "$APP_ID" \
  --role Contributor \
  --scope "/subscriptions/$SUB_ID/resourceGroups/rg-primefit-prod"
```

**3.3 Create the federated credential**, scoped to this repo's `main`
branch (matches `deploy-azure-api.yml`'s `workflow_dispatch`-only trigger,
run from `main`):

```bash
az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters '{
    "name": "github-primefit-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:vinodvin42/fitness-ai-app:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

**If you ever dispatch this workflow from a different branch or tag**,
this exact subject won't match the token GitHub sends, and `azure/login`
fails with an `AADSTS70021`-style error. Add another federated credential
(same command, a different `name` and `subject`) for any other ref you
actually use, rather than trying to make one subject match everything.

**3.4 Collect the three IDs the workflow needs:**

```bash
az account show --query tenantId -o tsv    # AZURE_TENANT_ID
az account show --query id -o tsv          # AZURE_SUBSCRIPTION_ID
# AZURE_CLIENT_ID is $APP_ID from 3.1
```

**3.5 Set six repository secrets.** GitHub web UI: repo → Settings →
Secrets and variables → Actions → New repository secret. Or with `gh`:

```bash
gh secret set AZURE_CLIENT_ID --body "$APP_ID"
gh secret set AZURE_TENANT_ID --body "$(az account show --query tenantId -o tsv)"
gh secret set AZURE_SUBSCRIPTION_ID --body "$SUB_ID"
gh secret set AZURE_RESOURCE_GROUP --body "rg-primefit-prod"
gh secret set AZURE_WEBAPP_NAME --body "<webAppName from step 1.5>"
gh secret set AZURE_DATABASE_URL --body "postgresql://primefitadmin:$PGPASS@<postgresServerFqdn from step 1.5>:5432/fitness_ai_app?sslmode=require"
```

(`AZURE_RESOURCE_GROUP` and `AZURE_WEBAPP_NAME` aren't actually sensitive
— they're kept as secrets alongside the rest purely so this is one
consistent setup step instead of two different mechanisms to explain.
`AZURE_DATABASE_URL` genuinely is sensitive: it's the same connection
string as the API's own `DATABASE_URL` app setting, reused here only
because `deploy-azure-api.yml`'s `prisma migrate deploy` step runs from
the GitHub Actions runner, not from inside the App Service, so it needs
its own way to reach Postgres.)

**One more thing this step doesn't cover — Postgres's firewall.** The
`AllowAzureServices` rule `infra/azure/modules/postgres.bicep` creates
lets the App Service reach Postgres, but a GitHub-hosted runner is not an
Azure resource, so it does **not** help `deploy-azure-api.yml`'s `prisma
migrate deploy` step connect. GitHub-hosted runner IP ranges are large and
change over time, so the pragmatic fix for a pilot-scale project — not a
silent one, and not baked permanently into the committed Bicep template
where it'd be easy to miss in review — is one explicit, visible firewall
rule you add yourself:

```bash
az postgres flexible-server firewall-rule create \
  --resource-group rg-primefit-prod \
  --name <postgres server name, e.g. fynrox-pg-xxxxxxxx> \
  --rule-name AllowGitHubActionsCI \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 255.255.255.255
```

**Be clear-eyed about what this actually does:** it opens the Postgres
server's network firewall to the entire internet (TLS + the real password
from step 1.2 are still required to actually connect — this rule alone
doesn't grant access, just the chance to attempt it). Reasonable for a
~100-user pilot where the alternative is a much more involved self-hosted
runner or private networking setup; not something to leave in place
indefinitely on a larger deployment. Narrowing this later (self-hosted
runner inside the same VNet, or running `migrate deploy` from inside the
App Service via Kudu instead of from GitHub's own infrastructure) is a
reasonable follow-up, not a launch blocker.

---

## 4. First deploy

Trigger `deploy-azure-api.yml` manually — GitHub web UI: repo → Actions →
"Deploy API to Azure" → Run workflow → branch `main`. Or:

```bash
gh workflow run deploy-azure-api.yml --ref main
```

Watch it run (Actions tab, or `gh run watch`). It installs the full
monorepo, generates the Prisma client, runs `prisma migrate deploy`
against the real Azure Postgres, builds `apps/api`, deploys to the App
Service, then polls `https://<webAppName>.azurewebsites.net/health` for
up to ~4 minutes before declaring success.

**On `migrate deploy`, not `db push`** — unlike `render.yaml` (written
when this project had no committed migration history at all),
`apps/api/prisma/migrations/` is real now, so this path never needed
`db push`'s "no history yet" escape hatch in the first place. If this is
genuinely the first time migrations run against this database, expect to
see the existing migration(s) apply cleanly, in order.

If the workflow fails at the `azure/login` step specifically, re-check
step 3.3's federated credential subject against the exact branch/ref you
dispatched from. If it fails at `/health` never responding, `az webapp log
tail --resource-group rg-primefit-prod --name <webAppName>` is the fastest
way to see what `config/env.ts` printed before exiting — a missing or
malformed app setting from step 2 is the most likely cause, since that
file fails fast and loud on purpose.

**Seed the database** once the deploy is green.

> **4 Sep 2026 — this step was rewritten because what it used to say did
> not work.** It previously told you to run `npm run db:seed
> --workspace=apps/api` from the App Service's SSH/Kudu console. Three
> separate things make that impossible, all confirmed by hand: the Kudu
> console runs in a *different, unprivileged container* from the app, so
> the deployed `node_modules` are not there; it has no real shell to
> interpret a compound command; and it enforces a hard ~230s server-side
> timeout, too short for even a scoped `npm install`. See commit 856d003.
> Do not spend time on that path again.

**First seed (accounts + content), one time only.** This is the one seed
that must create the bootstrap admin, and it must read the
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` app settings from step 2.3 —
which live on the Web App and are deliberately not in GitHub. Run it from
a machine that has the repo, with `DATABASE_URL` pointed at the live
Postgres and those two values passed in explicitly:

```bash
SEED_ADMIN_EMAIL="<the same value you set in step 2.3>" \
SEED_ADMIN_PASSWORD="<the same value you set in step 2.3>" \
DATABASE_URL="<the live connection string>" \
npm run db:seed --workspace=apps/api
```

Confirm the log line it prints shows your real email, not
`admin@fynrox.com`, before moving on. The seed never overwrites an
existing account's password, so a second run cannot reset it.

**Every seed after that: the `Seed content to Azure` workflow.** Actions
tab → *Seed content to Azure* → Run workflow. It re-seeds Programs,
Exercises, Workouts and Recipes from
`apps/api/src/lib/seedDatabase.ts` against `secrets.AZURE_DATABASE_URL`,
using the same runner-to-Postgres path `deploy-azure-api.yml`'s migrate
step already proves works on every deploy. Every write is a stable-id
upsert, so it is safe to run repeatedly.

It runs `--content-only`, and that is not a detail — **never remove that
flag from the workflow.** A full seed finds the admin account by
`SEED_ADMIN_EMAIL`, which a GitHub runner cannot see, so it would fall
back to the code default, fail to match your real admin's address, and
create a *second* super_admin with a publicly-known default password.

Two things it deliberately does not do: it does not migrate (that belongs
to `deploy-azure-api.yml` — if a seed fails on a missing column, run that
first), and it does not run on push, because seeding upserts content and
would quietly revert any edit an admin had made through the CMS to a
seeded Program, Exercise or Recipe.

---

## 5. Azure Static Web Apps — admin-web and user-mobile

Do this twice, once per app. **Not provisioned by Bicep on purpose** — the
idiomatic Static Web Apps setup is the Azure Portal's GitHub-connected
flow, which commits its own deploy workflow into your repo automatically;
fighting that from Bicep would fight the platform rather than use it.

**A real, documented wrinkle worth knowing before you start:** this repo
is an npm-workspaces monorepo, and Azure Static Web Apps' own Oryx-based
build has known problems resolving npm workspaces from a subfolder (confirmed
via Microsoft Q&A / docs as of 3 Sep 2026, not something this pass hit by
trial and error). The fix below — build in the workflow yourself, hand
Azure the finished output — sidesteps it entirely rather than hoping the
default path works, the same reasoning `infra/azure/modules/appService.bicep`
applies to the API's own build.

**admin-web:**

1. Azure Portal → **Create a resource** → **Static Web App**.
2. Plan type: **Free**.
3. Source: **GitHub** → authorize → repo `vinodvin42/fitness-ai-app` →
   branch `main`.
4. Build Presets: **Custom**. App location: `/apps/admin-web`. Api
   location: leave blank (no Azure Functions API here). Output location:
   `dist`.
5. **Review + create** → **Create**. Azure provisions the Static Web App
   and pushes a new workflow file straight to your repo —
   `.github/workflows/azure-static-web-apps-<random-name>.yml` — on its
   own, no action needed from you to make that commit happen. `git pull`
   before doing anything else locally.
6. **Edit that new workflow file immediately** (this is the fix for the
   npm-workspaces issue flagged above) — before its build step, add:
   ```yaml
   - uses: actions/setup-node@v4
     with:
       node-version: 20
       cache: npm
   - run: npm ci
   - run: npm run build --workspace=apps/admin-web
     env:
       VITE_API_BASE_URL: ${{ secrets.API_BASE_URL }}
   ```
   then in the `Azure/static-web-apps-deploy@...` step's `with:` block,
   set `skip_app_build: true` and change `app_location` to
   `apps/admin-web/dist` (the already-built output, not the source
   folder) — leaving `output_location` blank.
7. Add a repository secret `API_BASE_URL` = `https://<webAppDefaultHostName
   from step 1.5>` if you haven't already (same value both Static Web Apps
   need, just under the env var name each build tool expects — Vite reads
   `VITE_API_BASE_URL`, see step 6's `env:` above). **This has to be a
   build-time value the workflow injects, not a Static Web App
   "Application setting"** — Application settings are only exposed to a
   Functions API backend, and this is a pure static SPA with none, so
   anything set there would never reach the built bundle at all.
8. Push (or re-run the workflow) to trigger a real build. Once live, log
   in with the `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` from step 2.3 —
   not the `RUN-LOCALLY.md` dev credentials. Rotate the password once via
   Admin & System → Security's "Change password" form right after, same
   good practice `DEPLOY-RUNBOOK.md` recommends for the Render path.

**user-mobile:**

Same flow, with these differences:

- App location: `/apps/user-mobile`. Output location: `dist`.
- Step 6's build command is `npm run build:mobile` (the root-level script
  that runs `expo export --platform web` — see root `package.json`), and
  the `env:` var is `EXPO_PUBLIC_API_BASE_URL` instead of
  `VITE_API_BASE_URL` — confirmed elsewhere in this repo
  (`src/api/client.ts`) that this specific var name is what actually gets
  inlined into the exported web bundle.
- `app_location` after enabling `skip_app_build` becomes
  `apps/user-mobile/dist`.

Both apps' Free tier includes a modest monthly bandwidth/storage
allowance and custom-domain support — comfortably enough for a 100-person
pilot; check current limits in the portal if you ever wonder. Region for
a Static Web App is chosen independently in its own creation wizard, from
a much shorter supported-region list than general Azure resources — it
does not need to match `rg-primefit-prod`'s `centralindia` from step 1.

---

## 6. Close the loop on CORS

Now that both Static Web App URLs exist, replace the placeholder from
step 2.8:

```bash
az webapp config appsettings set \
  --resource-group rg-primefit-prod \
  --name <webAppName> \
  --settings CORS_ORIGINS="https://<admin-web-url>,https://<user-mobile-url>"
```

Comma-separated, no spaces, both `https://`. This restarts the API
automatically. Without this step the API is up but both frontends will
fail every request with a CORS error — don't skip it, same as the
Render path's own step 4.

---

## 7. Smoke test (do this for real, on the live URLs)

1. Open the admin-web URL, log in, confirm the Executive Dashboard shows
   real (seeded) numbers.
2. Open the user-mobile URL, sign up as a new user, complete onboarding,
   log a workout set. Confirm it shows up in the admin console's Users →
   that user's profile.
3. Hit `https://<webAppName>.azurewebsites.net/health` directly — confirm
   `{"status":"ok","env":"production"}`.
4. Trigger one rate-limited path on purpose (11 rapid login attempts with
   a wrong password) — confirm the 11th gets a 429, not a 500 or a crash.
   (`app.ts`'s `trust proxy` setting, originally added for Render's load
   balancer, applies unconditionally — no code change was needed for this
   to also work correctly behind Azure's own front end.)
5. If `SENTRY_DSN` is set: trigger a deliberate 500 somewhere and confirm
   it shows up in the Sentry project within a minute or two.
6. `az webapp log tail --resource-group rg-primefit-prod --name
   <webAppName>` while doing the above — confirm you see real request
   logs (morgan) rather than silence or repeated crash/restart lines.

---

## 8. After the first deploy succeeds

- Rotate every secret from step 2 if any of them were ever pasted into
  chat, a screenshot, or anywhere outside your terminal/password manager.
- Narrow or remove the `AllowGitHubActionsCI` firewall rule from step 3 if
  you stop needing CI-driven migrations from outside Azure (e.g. after
  switching to a self-hosted runner).
- Consider flipping `deploy-azure-api.yml`'s trigger from
  `workflow_dispatch` to `on: push: branches: [main]` once you've
  confirmed a manual run works end-to-end — deliberately left manual-only
  for this pass, see that file's own top comment.
- Point real custom domains at the App Service and both Static Web Apps if
  you want `fynrox.app`-style URLs instead of the generated
  `azurewebsites.net`/`azurestaticapps.net` ones — all three support this
  from their own Azure Portal blades, no code changes needed. Remember to
  add any new domain to `CORS_ORIGINS` (step 6) too.

---

## Rollback

Deliberately honest here rather than implying a one-click button that may
not exist for this specific deploy path: this Bicep template provisions a
**single-slot** App Service (Basic B1) — no staging slot, which is what
gives Render's dashboard its one-click "pick a prior deploy → Rollback."
Deployment slots need Standard tier or higher, a real cost/complexity
step up not justified for a ~100-user pilot; you can add one later
(`az webapp deployment slot create`) if it becomes worth it.

**What actually works today:**

- **Code rollback:** re-run `deploy-azure-api.yml` (`gh workflow run
  deploy-azure-api.yml --ref <a previous good commit's branch or tag>`) —
  this rebuilds and redeploys whatever source you point it at. Tagging
  releases (`git tag v1.0.0 && git push --tags`) before each real deploy
  makes this fast to aim; without tags, you'd check out the old commit
  onto a temporary branch and dispatch against that instead.
- **Watch out for the database when doing this:** `prisma migrate deploy`
  is forward-only. Rolling code back to before a migration while that
  migration is still applied to the live database can break the older
  code if the migration wasn't backward-compatible — the same "additive
  only, no automatic rollback" limitation `DEPLOY-RUNBOOK.md`'s own
  Rollback section flags for the Render path. Only roll code back past a
  migration you're actually prepared to also reverse by hand.
- **Database point-in-time restore**, for a real data-loss scenario, not a
  routine rollback tool: Postgres Flexible Server keeps `backupRetentionDays`
  (7, from `infra/azure/main.parameters.json`) of automated backups.
  `az postgres flexible-server restore` creates a **new** server from a
  point in time — it does not restore in place — see `az postgres
  flexible-server restore --help` when you actually need this.
- **Deployment history exists but isn't a guaranteed one-click affair**:
  Kudu keeps a log of every deploy at
  `https://<webAppName>.scm.azurewebsites.net/api/deployments` (JSON, most
  recent first) — useful for confirming *what* was deployed and *when*,
  less reliable as a "click to restore" mechanism for this OIDC/CLI-driven
  zip-deploy path specifically (that one-click affordance is better
  established for git-based continuous deployment, which this setup
  deliberately doesn't use — see `appService.bicep`'s own comment on why).
  Treat the GitHub Actions re-run above as the real rollback path, and
  Kudu's history as a way to confirm it worked.
