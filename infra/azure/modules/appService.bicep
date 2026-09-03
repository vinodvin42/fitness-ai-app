// App Service Plan + Linux Web App for apps/api.
//
// Go-live hardening, Azure path (3 Sep 2026). No Dockerfile, no container
// registry — this provisions Azure's built-in Node 20 Linux runtime
// (Oryx-managed base image), the direct analog of render.yaml's "Render
// builds straight from npm scripts, no Dockerfile" choice.
//
// One deliberate departure from a *pure* "Oryx builds on every deploy"
// setup, worth being explicit about (same "explain the real reasoning"
// bar as render.yaml's own comments): `.github/workflows/deploy-azure-api.yml`
// runs `npm ci` + `prisma generate` + `prisma migrate deploy` + the actual
// `tsc` build itself, in GitHub Actions, THEN deploys the already-built
// app (dist/ + node_modules + the generated Prisma client). That's more
// reliable than letting Oryx rediscover how to build a 4-workspace npm
// monorepo with no root-level `build` script on every deploy, and it
// keeps `prisma migrate deploy` (which needs the real DATABASE_URL
// secret) inside CI's controlled environment rather than folded into a
// build hook running on the App Service host itself — see render.yaml's
// own comment on why `db push`/`migrate deploy` is kept as its own
// explicit step, separate from the build command, for the same reason.
// SCM_DO_BUILD_DURING_DEPLOYMENT is therefore "false" below: Oryx still
// provides the Node 20 Linux *runtime*, it just isn't asked to rebuild
// something CI already built. The App Service Plan/SKU choice below has
// nothing to do with this — it'd be identical either way.
//
// api-version note (same honesty bar as postgres.bicep): 2025-03-01 is the
// current stable (non-preview) GA api-version for Microsoft.Web/sites —
// confirmed 3 Sep 2026 against Microsoft Learn's live Bicep reference
// (learn.microsoft.com/azure/templates/microsoft.web/sites), including the
// exact siteConfig property names used below (linuxFxVersion, alwaysOn,
// appCommandLine, appSettings, ftpsState, healthCheckPath, minTlsVersion)
// and properties.httpsOnly/serverFarmId. Applied to Microsoft.Web/serverfarms
// too, same release train. That's a docs-schema check, not a real
// deployment — this sandbox never ran `az login` against a real
// subscription (see AZURE-DEPLOY-RUNBOOK.md's own honesty note), so
// `az deployment group create` actually accepting this template is still
// this pass's first real test. If Azure has moved the api-version again by
// the time you deploy, `az provider show --namespace Microsoft.Web --query
// "resourceTypes[?resourceType=='sites'].apiVersions" -o tsv` will list
// current ones.
//
// IMPORTANT — redeploying this template overwrites app settings wholesale.
// `siteConfig.appSettings` below is the *complete* list ARM will apply —
// anything added afterward out-of-band (e.g. the secrets
// AZURE-DEPLOY-RUNBOOK.md has you add via `az webapp config appsettings
// set` right after the first deploy) will be WIPED if this template is
// ever re-run (e.g. to bump the SKU). If that happens, just re-run the
// `az webapp config appsettings set` command from the runbook afterward —
// nothing is lost, but it is not automatic. Capture current values first
// with `az webapp config appsettings list` if you're ever unsure what was
// set.

@description('Azure region for the App Service Plan and Web App.')
param location string

@description('App Service Plan resource name.')
param planName string

@description('Web App resource name (must be globally unique — becomes <name>.azurewebsites.net).')
param webAppName string

@description('App Service Plan SKU name. B1 (Basic) is the cheapest tier that supports Always On and custom health checks reliably for a real pilot; F1 (Free) works too but sleeps on inactivity and has daily compute quotas, same trade-off render.yaml\'s own comment flags for Render\'s free tier.')
param skuName string = 'B1'

@description('App Service Plan SKU tier — must match skuName\'s family (Free/Shared/Basic/Standard/PremiumV2/...).')
param skuTier string = 'Basic'

@description('Linux runtime stack string. Pipe-delimited, not colon — that\'s the ARM linuxFxVersion format (az webapp CLI flags use a different colon-delimited shorthand for the same thing).')
param linuxFxVersion string = 'NODE|20-lts'

@description('Full Postgres connection string, built by main.bicep from the postgres module\'s output + the admin credentials. Includes sslmode=require — Flexible Server requires TLS by default.')
@secure()
param databaseUrl string

@description('Initial CORS_ORIGINS value. Deliberately a harmless, already-used-elsewhere placeholder (the same localhost origin ci.yml uses for its own CORS_ORIGINS) rather than empty string — env.ts refuses to boot at all in production with an empty CORS_ORIGINS, so shipping a real (if temporary) value here means the very first deploy actually boots instead of crash-looping. Replace with the two real Static Web App URLs once they exist — see AZURE-DEPLOY-RUNBOOK.md\'s "close the CORS loop" step.')
param corsOriginsPlaceholder string = 'http://localhost:5173'

@description('AI_PROVIDER default — matches .env.example\'s own default. Optional feature either way; ANTHROPIC_API_KEY/OPENAI_API_KEY being unset just means GET /ai/status reports configured:false.')
param aiProvider string = 'anthropic'

@description('RAZORPAY_CURRENCY default — matches .env.example. Meaningless until real Razorpay keys are set (parked intentionally, see AZURE-DEPLOY-RUNBOOK.md).')
param razorpayCurrency string = 'INR'

var alwaysOnSupported = !(skuTier == 'Free' || skuTier == 'Shared')

resource plan 'Microsoft.Web/serverfarms@2025-03-01' = {
  name: planName
  location: location
  sku: {
    name: skuName
    tier: skuTier
  }
  kind: 'linux'
  properties: {
    reserved: true // required for Linux plans
  }
}

resource webApp 'Microsoft.Web/sites@2025-03-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: linuxFxVersion
      alwaysOn: alwaysOnSupported
      ftpsState: 'FtpsOnly'
      minTlsVersion: '1.2'
      // Matches render.yaml's healthCheckPath and the app's real
      // GET /health route (app.ts) — App Service pings this and recycles
      // an instance that stops answering it.
      healthCheckPath: '/health'
      // Oryx's default Node startup (looking for a root server.js / "main")
      // won't find apps/api's entry point in this monorepo layout, so it's
      // set explicitly here instead of relying on auto-detection.
      appCommandLine: 'node apps/api/dist/index.js'
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          // See this file's top comment for why this is false rather than
          // true despite the App Service using Oryx's Node runtime.
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          name: 'DATABASE_URL'
          value: databaseUrl
        }
        {
          name: 'CORS_ORIGINS'
          value: corsOriginsPlaceholder
        }
        {
          name: 'AI_PROVIDER'
          value: aiProvider
        }
        {
          name: 'RAZORPAY_CURRENCY'
          value: razorpayCurrency
        }
        {
          name: 'PRICE_CURRENCY_CONFIRMED'
          value: 'false'
        }
        {
          name: 'JWT_ACCESS_TTL_MIN'
          value: '15'
        }
        {
          name: 'JWT_REFRESH_TTL_DAYS'
          value: '30'
        }
        {
          name: 'ADMIN_JWT_ACCESS_TTL_MIN'
          value: '480'
        }
        {
          name: 'PROFESSIONAL_JWT_ACCESS_TTL_MIN'
          value: '15'
        }
        {
          name: 'PROFESSIONAL_JWT_REFRESH_TTL_DAYS'
          value: '30'
        }
        // Deliberately NOT set here: PORT (Azure's Linux Node runtime
        // injects its own PORT env var and the app already reads
        // process.env.PORT via config/env.ts — setting one ourselves would
        // just be redundant at best, wrong at worst if it ever drifts from
        // what the platform actually listens on).
        //
        // Deliberately NOT set here, same reasoning render.yaml's own
        // `sync: false` vars document: JWT_ACCESS_SECRET,
        // JWT_REFRESH_SECRET, ADMIN_JWT_SECRET, PROFESSIONAL_JWT_SECRET,
        // TWO_FACTOR_ENCRYPTION_KEY (all fail-fast/required — the API
        // will not boot without real values), and the fully-optional
        // RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET/RAZORPAY_WEBHOOK_SECRET/
        // ANTHROPIC_API_KEY/OPENAI_API_KEY/AI_MODEL/SENTRY_DSN/
        // SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD. None of these belong in a
        // committed Bicep file. AZURE-DEPLOY-RUNBOOK.md's next step sets
        // all of them via `az webapp config appsettings set` — do that
        // BEFORE the first GitHub Actions deploy so the app boots clean
        // on its first real run instead of crash-looping on a missing
        // secret.
      ]
    }
  }
}

@description('The Web App resource name, echoed back for convenience.')
output webAppName string = webApp.name

@description('Default hostname, e.g. <webAppName>.azurewebsites.net.')
output defaultHostName string = webApp.properties.defaultHostName
