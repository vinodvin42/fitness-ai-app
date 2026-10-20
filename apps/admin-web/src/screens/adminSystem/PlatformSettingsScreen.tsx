import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AdminPlatformSettingsResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { useCan } from "../../lib/permissions";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ADMIN_SYSTEM_SUB_NAV } from "./subNav";

type Section = "general" | "security" | "integrations" | "ai";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "general", label: "General" },
  { key: "security", label: "Security" },
  { key: "integrations", label: "Integrations" },
  { key: "ai", label: "AI Coach" },
];

async function fetchSettings(): Promise<AdminPlatformSettingsResponse> {
  const res = await apiClient.get<AdminPlatformSettingsResponse>("/admin/platform-settings");
  return res.data;
}

function Row({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle py-2 last:border-0">
      <div>
        <div className="text-sm text-text-primary">{label}</div>
        {note && <div className="text-xs text-text-dim">{note}</div>}
      </div>
      <div className="text-sm text-text-secondary">{value}</div>
    </div>
  );
}

function YesNo({ on, yes = "On", no = "Off" }: { on: boolean; yes?: string; no?: string }) {
  return <span className={on ? "text-accent" : "text-text-dim"}>{on ? yes : no}</span>;
}

/**
 * 12.08 Platform Settings (docs/admin/03-screen-inventory.md §12.08), Oct
 * 2026 — the spec's left settings-nav with settings cards, showing what
 * the platform is actually running with (GET /admin/platform-settings; see
 * adminPlatformSettings.service.ts). These come from the server's
 * configuration, so they're read-only here: changing one is a deploy. The
 * one setting stored in the database, AI Coach on/off, is editable with
 * the same audited switch as AI Operations (and goes through approval for
 * roles whose changes need one). Secrets are never shown — only whether
 * something is configured.
 */
export function PlatformSettingsScreen() {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("general");
  // Hide what this role can't do (the API still checks every call).
  const canEdit = useCan("admin", "edit");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-platform-settings"],
    queryFn: fetchSettings,
  });

  const toggleAiCoach = useMutation({
    mutationFn: (isEnabled: boolean) => apiClient.patch("/admin/ai-ops/ai-coach", { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-platform-settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-ops-ai-coach"] });
    },
  });

  return (
    <AppShell title="Platform Settings" subNav={ADMIN_SYSTEM_SUB_NAV}>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load platform settings.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-4 md:flex-row">
            <nav className="flex shrink-0 gap-1 md:w-48 md:flex-col" aria-label="Settings sections">
              {SECTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-current={section === s.key ? "page" : undefined}
                  onClick={() => setSection(s.key)}
                  className={`rounded-md px-3 py-2 text-left text-sm ${
                    section === s.key ? "bg-surface-raised text-text-primary" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </nav>

            <div className="min-w-0 flex-1 space-y-4">
              <p className="text-xs text-text-dim">
                These come from the server's configuration. Changing one means changing the server settings and deploying, not
                editing here.
              </p>

              {section === "general" && (
                <div className="rounded-lg border border-border-subtle bg-surface px-4 py-2">
                  <Row label="Environment" value={data.general.environment} />
                  <Row label="Public API address" value={data.general.publicApiUrl ?? "Not set (links use the server's own address)"} />
                  <Row label="Currency" value={data.general.currency} />
                  <Row label="API instances" value={data.general.apiInstances} />
                  <Row
                    label="Shared rate-limit store"
                    value={<YesNo on={data.general.sharedRateLimitStore} yes="Connected" no="Not connected" />}
                    note="Needed when more than one API instance runs"
                  />
                  <Row
                    label="Grievance officer"
                    note="Shown in the app's Help screen (India e-commerce rules, rule 4(5))"
                    value={
                      data.grievanceOfficer.configured ? (
                        `${data.grievanceOfficer.name}, ${data.grievanceOfficer.designation} · ${data.grievanceOfficer.email}`
                      ) : (
                        <span className="text-warning">Not set yet</span>
                      )
                    }
                  />
                </div>
              )}

              {section === "security" && (
                <div className="rounded-lg border border-border-subtle bg-surface px-4 py-2">
                  <Row label="Admin sign-in code (MFA)" value={<YesNo on={data.security.adminMfaRequired} yes="Required" no="Not required" />} />
                  <Row
                    label="Reason required for Super Admin's risky changes"
                    value={<YesNo on={data.security.superAdminReasonRequired} yes="Required" no="Not required" />}
                  />
                  <Row label="Approval requests expire after" value={`${data.security.approvalExpiryDays} days`} />
                  <Row label="Admin session length" value={`${data.security.adminSessionMinutes} minutes`} />
                  <Row label="App sign-in token" value={`${data.security.userAccessTokenMinutes} minutes`} note="Renewed automatically" />
                  <Row label="App stays signed in for" value={`${data.security.userRefreshTokenDays} days`} />
                </div>
              )}

              {section === "integrations" && (
                <div className="rounded-lg border border-border-subtle bg-surface px-4 py-2">
                  <Row
                    label="Payments"
                    value={
                      <>
                        {data.integrations.payments.provider === "mock" ? "Test payments (mock)" : "Razorpay"} ·{" "}
                        <YesNo on={data.integrations.payments.configured} yes="configured" no="not configured" />
                      </>
                    }
                  />
                  <Row
                    label="AI provider"
                    value={
                      <>
                        {data.integrations.ai.provider} ({data.integrations.ai.model}) ·{" "}
                        <YesNo on={data.integrations.ai.configured} yes="configured" no="not configured" />
                      </>
                    }
                  />
                  <Row label="Food database" value={data.integrations.foodData === "openfoodfacts" ? "Open Food Facts" : "Offline sample list"} />
                  <Row label="Email (SMTP)" value={<YesNo on={data.integrations.email.configured} yes="Configured" no="Not configured" />} />
                  <Row label="Error tracking" value={<YesNo on={data.integrations.errorTracking.configured} yes="Configured" no="Not configured" />} />
                  <div className="py-2 text-xs text-text-dim">
                    More detail is on <Link to="/admin-system/integrations" className="text-accent hover:underline">Integrations</Link>.
                  </div>
                </div>
              )}

              {section === "ai" && (
                <div className="rounded-lg border border-border-subtle bg-surface p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">AI Coach chat</div>
                      <p className="mt-1 text-xs text-text-secondary">
                        Turning this off stops AI Coach for everyone. It's the only setting stored in the database, so it can be
                        changed here.
                      </p>
                      <p className="mt-2 text-xs text-text-dim">
                        {data.aiCoach.updatedByAdminName
                          ? `Last changed by ${data.aiCoach.updatedByAdminName}, ${new Date(data.aiCoach.updatedAt!).toLocaleString()}`
                          : "Never changed — on by default."}
                      </p>
                    </div>
                    {canEdit ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={data.aiCoach.isEnabled}
                        aria-label="AI Coach chat"
                        disabled={toggleAiCoach.isPending}
                        onClick={() => toggleAiCoach.mutate(!data.aiCoach.isEnabled)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                          data.aiCoach.isEnabled ? "bg-accent" : "bg-border-subtle"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-canvas transition-transform ${
                            data.aiCoach.isEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    ) : (
                      <span className="shrink-0 text-sm">
                        <YesNo on={data.aiCoach.isEnabled} />
                      </span>
                    )}
                  </div>
                  {toggleAiCoach.isError && (
                    <p className="mt-3 text-xs text-danger">{extractErrorMessage(toggleAiCoach.error, "Couldn't change AI Coach.")}</p>
                  )}
                </div>
              )}

              <NotAvailablePanel keys={data.notAvailable} subtitle="No stored setting exists for these yet." />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
