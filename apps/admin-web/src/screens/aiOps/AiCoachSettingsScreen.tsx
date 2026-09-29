import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { AdminAiCoachSettingsResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";

async function fetchAiCoachSettings(): Promise<AdminAiCoachSettingsResponse> {
  const res = await apiClient.get<AdminAiCoachSettingsResponse>("/admin/ai-ops/ai-coach");
  return res.data;
}

/**
 * Module 11 — AI Operations (docs/admin/03-screen-inventory.md §11.01–
 * 11.03), added 27 Aug 2026. reports/build-plan.html's own "needs your
 * decision" framing for the full Feature Console (one row per AI
 * capability, rollout %), Usage metrics, and Safety/Overrides log named
 * its own smaller alternative: this build has exactly one real AI
 * capability (AI Coach chat), so a console with 3 fabricated rows next to
 * 1 real one would misrepresent what's actually live — the same reasoning
 * that's kept every other "empty by construction" screen unbuilt. This
 * ships that named smaller slice instead: a real, audit-logged on/off
 * switch for AI Coach chat, backed by `AiCoachSettings` (prisma/schema.
 * prisma) and enforced server-side in aiCoach.service.ts's sendMessage()
 * — turning this off actually stops the feature, it isn't cosmetic.
 *
 * Provider status (which provider, whether an API key is set, which
 * model) is read context here, not a duplicate control — Module 12.06
 * Integrations already owns that read-only display; this screen echoes
 * the same `getAiProviderStatus()` result so the toggle's effect is
 * legible without a second tab open.
 *
 * See adminAiOps.service.ts's own doc comment for the full list of what's
 * still honestly NOT built (multi-capability rows, usage metrics beyond
 * Integrations' existing reply count, a safety/overrides log) — rendered
 * below via `NotAvailablePanel`, same convention as every other
 * "half-real" module in this build.
 */
export function AiCoachSettingsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-ai-ops-ai-coach"],
    queryFn: fetchAiCoachSettings,
  });

  const toggleMutation = useMutation({
    mutationFn: (isEnabled: boolean) => apiClient.patch("/admin/ai-ops/ai-coach", { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ai-ops-ai-coach"] });
    },
  });

  return (
    <AppShell title={t("aiCoachSettings.aiOperations")}>
      <div className="space-y-4">
        <div className="max-w-xl rounded-lg border border-border-subtle bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">{t("aiCoachSettings.aiCoachChat")}</div>
              <p className="mt-1 text-xs text-text-secondary">
                The one real AI capability in this build. Turning this off returns a real "temporarily
                disabled" response to every user — it doesn't just hide a button in the app.
              </p>
            </div>
            {data && (
              <button
                type="button"
                role="switch"
                aria-checked={data.isEnabled}
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate(!data.isEnabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                  data.isEnabled ? "bg-accent" : "bg-border-subtle"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-canvas transition-transform ${
                    data.isEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            )}
          </div>

          {isLoading && <p className="mt-3 text-xs text-text-dim">{t("aiCoachSettings.loading")}</p>}
          {isError && (
            <p className="mt-3 text-xs text-danger">{extractErrorMessage(error, "Couldn't load AI Coach settings.")}</p>
          )}
          {toggleMutation.isError && (
            <p className="mt-3 text-xs text-danger">
              {extractErrorMessage(toggleMutation.error, "Couldn't update AI Coach settings.")}
            </p>
          )}

          {data && (
            <div className="mt-3 space-y-1 border-t border-border-subtle pt-3 text-xs text-text-dim">
              <div>
                Provider: {data.provider.provider === "anthropic" ? "Anthropic" : "OpenAI"} (
                {data.provider.model}) — {data.provider.configured ? "configured" : "not configured on this server"}
              </div>
              <div>
                {data.updatedByAdminName
                  ? `Last changed by ${data.updatedByAdminName}, ${new Date(data.updatedAt!).toLocaleString()}`
                  : "Never explicitly toggled — enabled by default."}
              </div>
            </div>
          )}
        </div>

        <NotAvailablePanel
          keys={["aiFeatureConsole", "aiUsageMetrics", "aiSafetyOverridesLog"]}
          subtitle={t("aiCoachSettings.theRestOf11")}
        />
      </div>
    </AppShell>
  );
}
