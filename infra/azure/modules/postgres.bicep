// Azure Database for PostgreSQL — Flexible Server + one logical database.
//
// Go-live hardening, Azure path (3 Sep 2026). Mirrors render.yaml's
// database resource (`primefit-db`, Postgres 16, Render's cheapest
// non-sleeping "starter" plan) as closely as Azure's equivalent SKU model
// allows: Burstable Standard_B1ms is Azure Postgres Flexible Server's
// cheapest "real" (non-preview, backups included) tier, the direct analog
// of Render's starter Postgres for a ~100-user pilot.
//
// api-version note (honesty bar, matching render.yaml's own "expected vs
// confirmed" comments): 2024-08-01 is the current stable (non-preview) GA
// api-version for flexibleServers/databases/firewallRules — confirmed
// 3 Sep 2026 against Microsoft Learn's live Bicep reference
// (learn.microsoft.com/azure/templates/microsoft.dbforpostgresql/2024-08-01/flexibleservers),
// including the exact property names used below (administratorLogin,
// administratorLoginPassword, storage.storageSizeGB, backup.*,
// highAvailability.mode, sku.name/tier with tier 'Burstable'). That's a
// docs-schema check, not a real deployment — this sandbox never ran
// `az login` against a real subscription (see AZURE-DEPLOY-RUNBOOK.md's
// own honesty note), so `az deployment group create` actually accepting
// this template is still this pass's first real test. If Azure has moved
// the api-version again by the time you deploy, run
// `az provider show --namespace Microsoft.DBforPostgreSQL --query "resourceTypes[?resourceType=='flexibleServers'].apiVersions" -o tsv`
// and swap in whatever it lists first (newest).

@description('Azure region for the Postgres Flexible Server.')
param location string

@description('Name of the Flexible Server resource (must be globally unique — becomes <name>.postgres.database.azure.com).')
param serverName string

@description('Admin username. Must NOT be a reserved name (azure_superuser, azure_pg_admin, admin, administrator, root, guest, public, or anything starting with pg_).')
param administratorLogin string

@description('Admin password. Generate with the command in AZURE-DEPLOY-RUNBOOK.md — plain alphanumeric so it never needs URL-encoding inside DATABASE_URL.')
@secure()
param administratorLoginPassword string

@description('Postgres major version — 16, matching render.yaml and docker-compose.yml so local/CI/prod all agree.')
param postgresVersion string = '16'

@description('Compute SKU name. Burstable B1ms is the cheapest reasonable tier for a ~100-user pilot.')
param skuName string = 'Standard_B1ms'

@description('Compute SKU tier. Must match the family skuName belongs to.')
param skuTier string = 'Burstable'

@description('Storage size in GiB. 32 is Flexible Server\'s minimum and is plenty for a pilot-scale database.')
param storageSizeGB int = 32

@description('Logical database name created inside the server. Matches the name used by docker-compose.yml/.env.example locally (fitness_ai_app), not render.yaml\'s Render-resource-name (primefit-db) — those were always two different things even on Render.')
param databaseName string = 'fitness_ai_app'

@description('Backup retention in days. 7 is the Flexible Server minimum and is fine for a pilot.')
param backupRetentionDays int = 7

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    storage: {
      storageSizeGB: storageSizeGB
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    // No `network` block => public access (no VNet/private endpoint). That
    // matches render.yaml's own Postgres, which is also publicly reachable
    // (Render manages the network boundary itself) — the cheapest,
    // simplest option for a pilot with no App Service VNet integration.
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgresServer
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Lets the App Service (no VNet integration — see appService.bicep's own
// comment) reach this server. Start/end IP "0.0.0.0" is Azure's documented
// special sentinel for "allow traffic from other Azure resources," NOT
// "allow the whole internet" — that's a separate, deliberately-NOT-baked-
// into-this-template decision, see AZURE-DEPLOY-RUNBOOK.md's firewall step
// for the (temporary, flagged) rule GitHub Actions' `migrate deploy` step
// needs, which this file does not create.
resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgresServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

@description('Fully qualified domain name of the server, e.g. <serverName>.postgres.database.azure.com.')
output serverFqdn string = postgresServer.properties.fullyQualifiedDomainName

@description('The server resource name, echoed back for convenience.')
output serverName string = postgresServer.name

@description('The logical database name, echoed back for convenience.')
output databaseName string = database.name
