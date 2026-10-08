import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { AdminIntegrationDirectoryResponse, AdminIntegrationListItem } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ADMIN_SYSTEM_SUB_NAV } from "./subNav";

const CATEGORY_LABELS: Record<string, string> = {
  payment_gateway: "Payment Gateway",
  ai_provider: "AI Provider",
  error_monitoring: "Error Monitoring",
};

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

async function fetchIntegrations(): Promise<AdminIntegrationDirectoryResponse> {
  const res = await apiClient.get<AdminIntegrationDirectoryResponse>("/admin/integrations");
  return res.data;
}

function IntegrationCard({ integration }: { integration: AdminIntegrationListItem }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-text-primary">{integration.name}</div>
          <div className="text-xs uppercase tracking-wide text-text-dim">{CATEGORY_LABELS[integration.category]}</div>
        </div>
        <StatusBadge status={integration.configured ? "active" : "not_verified"} />
      </div>
      <p className="mt-3 text-xs text-text-secondary">{integration.detail}</p>
      {integration.usageSummary ? (
        <div className="mt-3 rounded-md bg-surface-raised px-3 py-2 text-xs text-text-secondary">
          {integration.usageSummary.label}: <span className="font-medium text-text-primary">{integration.usageSummary.count}</span>
          {/* amountCents is optional (25 Aug 2026) — a real count can exist
              with no real cost figure to show alongside it (AI Coach has no
              per-call cost tracked anywhere in this build). Omitting the
              clause beats showing a fabricated "$0.00 total". */}
          {integration.usageSummary.amountCents !== undefined && (
            <>
              {" · "}
              {money(integration.usageSummary.amountCents)} total
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-md bg-surface-raised px-3 py-2 text-xs text-text-dim">
          {!integration.configured
            ? "No usage — not configured."
            : integration.category === "error_monitoring"
              ? // Sentry is genuinely in active use the moment it's configured
                // (it's wired into the global error handler) — a "no activity
                // yet" message would misreport that as dormant. It just has
                // nothing to count, ever — errors happen as they happen, there's
                // no running total to eventually show.
                "No usage count to show — it captures errors as they happen, it doesn't produce a running total."
              : // Razorpay-with-zero-payments or AI Coach-with-zero-messages —
                // both a real feature with real activity possible, just none
                // yet, unlike Sentry's case above.
                "Configured, but no activity yet."}
        </div>
      )}
    </div>
  );
}

/**
 * 12.06 Integrations (docs/admin/03-screen-inventory.md §12.06), added 25
 * Aug 2026 — the Figma spec is "a connected-integrations table and an API
 * keys card." This ships the integrations half only, and unlike every
 * prior "half-real" module in this build, every row is entirely real:
 * this app wires up three external services (Razorpay, the AI provider,
 * and — added the same day, once Sentry itself existed — error
 * monitoring), and each already had a real status helper written for a
 * different reason — see `adminIntegrations.service.ts`'s own doc comment
 * for the full breakdown. **25 Aug 2026:** the AI Provider card now shows
 * a real usage count too, now that AI Coach chat (Phase 2 §H) actually
 * calls it — no cost figure alongside it, since this build tracks no
 * per-call spend for either AI provider.
 *
 * **API Keys is honestly NOT built** — no third-party-facing, admin-issued
 * API key concept exists anywhere in this build (this is a consumer/admin
 * app, not a developer platform) — renders via `NotAvailablePanel`.
 *
 * Read-only — nothing here is admin-authored; this reports the real state
 * of two code-level integrations, it doesn't manage them. Module 12's
 * third real screen, so it joins `ADMIN_SYSTEM_SUB_NAV`.
 */
export function IntegrationsScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-integrations"],
    queryFn: fetchIntegrations,
  });

  return (
    <AppShell title={t("integrations.integrations")} subNav={ADMIN_SYSTEM_SUB_NAV}>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-text-secondary">{t("integrations.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load integrations.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("integrations.retry")}
            </button>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.integrations.map((integration) => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))}
          </div>
        )}

        {data && (
          <NotAvailablePanel
            keys={data.notAvailable}
            subtitle={t("integrations.thisIsAConsumer")}
          />
        )}
      </div>
    </AppShell>
  );
}
