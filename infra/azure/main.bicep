// Azure Blueprint — apps/api + its Postgres database.
//
// Go-live hardening, Azure path (3 Sep 2026). This is the Azure analog of
// ../../render.yaml: deploy this at resource-group scope and it provisions
// a Postgres Flexible Server + database, an App Service Plan, and the
// Linux Web App that will run apps/api — wired together the same way
// render.yaml wires its two resources (the API's DATABASE_URL is built
// from the Postgres module's own output, never typed by hand).
//
// What this does NOT provision, on purpose (see the "What to build"
// scope in this pass's own instructions): the two Azure Static Web Apps
// for apps/admin-web and apps/user-mobile. Their idiomatic setup is the
// Azure Portal's GitHub-connected flow, which generates its own deploy
// workflow automatically — trying to fight that from Bicep would fight
// the platform rather than use it. See AZURE-DEPLOY-RUNBOOK.md for that
// manual, one-time step. apps/coach-mobile is out of scope entirely, same
// as the existing Render runbook's own documented decision.
//
// What's verified vs. not, honestly (same bar as render.yaml's own
// comment): this template is syntactically valid per `az bicep build`
// (see AZURE-DEPLOY-RUNBOOK.md for the exact command/output) — nothing
// more. It has never been deployed against a real subscription; this pass
// never ran `az login` deliberately (see this repo's own constraints).
// The resource shapes, property names, and api-versions below are correct
// by direct knowledge of the documented Bicep schema for these resource
// types, not by watching a real `az deployment group create` succeed.
// Your first real deploy (AZURE-DEPLOY-RUNBOOK.md step 2) is the actual
// first test of this file, the same "expected to work, not yet confirmed"
// category render.yaml's Postgres step was before Render's own first run.

@description('Azure region for every resource this template creates. Static Web Apps (provisioned separately, see the runbook) support a much smaller region list than this does — that only matters for those, not for this file.')
param location string = 'centralindia'

@description('Short prefix used to build every resource name below (e.g. "fynrox" -> fynrox-plan, fynrox-api-<suffix>, fynrox-pg-<suffix>). Lowercase letters/numbers/hyphens only — some derived names feed into globally-unique DNS labels.')
@minLength(3)
@maxLength(20)
param namePrefix string = 'fynrox'

@description('Postgres admin username. Must NOT be a reserved name — see modules/postgres.bicep.')
param postgresAdminUsername string = 'primefitadmin'

@description('Postgres admin password. No default on purpose — you must pass this explicitly (see AZURE-DEPLOY-RUNBOOK.md for the generation command) so a real credential never ends up sitting in main.parameters.json or this file\'s defaults.')
@secure()
param postgresAdminPassword string

@description('Postgres major version. 16, matching render.yaml and docker-compose.yml.')
param postgresVersion string = '16'

@description('Postgres compute SKU name. Burstable B1ms is the cheapest reasonable tier for a ~100-user pilot.')
param postgresSkuName string = 'Standard_B1ms'

@description('Postgres compute SKU tier — must match the family postgresSkuName belongs to.')
param postgresSkuTier string = 'Burstable'

@description('Postgres storage size in GiB. 32 is Flexible Server\'s minimum.')
param postgresStorageSizeGB int = 32

@description('Logical database name inside the server. Matches docker-compose.yml/.env.example\'s local convention.')
param databaseName string = 'fitness_ai_app'

@description('App Service Plan SKU name. B1 (Basic) — see modules/appService.bicep for the F1/Free trade-off note.')
param appServicePlanSkuName string = 'B1'

@description('App Service Plan SKU tier — must match the family appServicePlanSkuName belongs to.')
param appServicePlanSkuTier string = 'Basic'

@description('Linux runtime stack string for the Web App. NODE|20-lts matches this repo\'s Node 20 elsewhere (ci.yml, package.json engines).')
param linuxFxVersion string = 'NODE|20-lts'

// Global DNS uniqueness (Postgres FQDN, Web App hostname) without asking
// the operator to hand-pick a unique name — deterministic per resource
// group, so redeploying into the same RG always targets the same names.
var uniqueSuffix = uniqueString(resourceGroup().id)
var postgresServerName = '${namePrefix}-pg-${uniqueSuffix}'
var appServicePlanName = '${namePrefix}-plan'
var webAppName = '${namePrefix}-api-${uniqueSuffix}'

module postgres 'modules/postgres.bicep' = {
  name: 'postgresDeploy'
  params: {
    location: location
    serverName: postgresServerName
    administratorLogin: postgresAdminUsername
    administratorLoginPassword: postgresAdminPassword
    postgresVersion: postgresVersion
    skuName: postgresSkuName
    skuTier: postgresSkuTier
    storageSizeGB: postgresStorageSizeGB
    databaseName: databaseName
  }
}

// Built from the module's own output (never hand-typed) — sslmode=require
// because Flexible Server enforces TLS by default. This stays tainted as
// a secure value through to the appService module below since it's built
// from postgresAdminPassword, a @secure() parameter.
var databaseUrl = 'postgresql://${postgresAdminUsername}:${postgresAdminPassword}@${postgres.outputs.serverFqdn}:5432/${databaseName}?sslmode=require'

module appService 'modules/appService.bicep' = {
  name: 'appServiceDeploy'
  params: {
    location: location
    planName: appServicePlanName
    webAppName: webAppName
    skuName: appServicePlanSkuName
    skuTier: appServicePlanSkuTier
    linuxFxVersion: linuxFxVersion
    databaseUrl: databaseUrl
  }
}

@description('Postgres server FQDN — safe to print (not a secret). Use it plus the username/password you chose to reassemble DATABASE_URL for the GitHub secret the deploy workflow needs (see AZURE-DEPLOY-RUNBOOK.md) — deliberately not output as a full connection string here so a real password is never printed into deployment history.')
output postgresServerFqdn string = postgres.outputs.serverFqdn

output postgresServerName string = postgres.outputs.serverName

output databaseName string = postgres.outputs.databaseName

@description('The API Web App\'s resource name — needed for `az webapp config appsettings set` / `az webapp deploy` / the GitHub Actions AZURE_WEBAPP_NAME secret.')
output webAppName string = appService.outputs.webAppName

@description('The API\'s live URL once deployed: https://<this>.')
output webAppDefaultHostName string = appService.outputs.defaultHostName

output appServicePlanName string = appServicePlanName
