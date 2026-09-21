import { useQuery } from "@tanstack/react-query";
import type { AdminPrivacyDashboardResponse } from "@fitness-ai-app/types";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ADMIN_SYSTEM_SUB_NAV } from "./subNav";

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

async function fetchPrivacy(): Promise<AdminPrivacyDashboardResponse> {
  const res = await apiClient.get<AdminPrivacyDashboardResponse>("/admin/privacy");
  return res.data;
}

/**
 * 12.04 Privacy & Data Governance (docs/admin/03-screen-inventory.md
 * §12.04), added 26 Aug 2026 — two real cards, both genuinely different
 * privacy artifacts (see adminPrivacy.service.ts's top comment for the
 * full story, including a mid-build correction): a real **DSAR log**
 * (every self-service data export / account deletion from
 * `apps/user-mobile`'s Security screen, surfaced console-wide for the
 * first time, and — as of Wave 4, 20 Sep 2026 — also a real, ownable
 * `AdminActionItem` in the unified Action Required queue) and a real
 * **Sensitive Data Access Log** (every ADMIN request to view a user's
 * locked sensitive health data, Module 02). Consent management moved out
 * of "not built" this same wave too — see `ConsentManagementScreen.tsx`
 * (linked below), a separate per-user screen rather than a third card
 * here, since consent is naturally scoped to one user at a time. Data
 * retention is still honestly not built — no retention-policy/scheduled-
 * deletion entity exists anywhere in this schema.
 */
export function PrivacyScreen() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-privacy"],
    queryFn: fetchPrivacy,
  });

  return (
    <AppShell title="Privacy & Data Governance" subNav={ADMIN_SYSTEM_SUB_NAV}>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load the privacy dashboard.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">DSAR Log</div>
              <p className="mt-1 text-xs text-text-dim">
                Every self-service data export and account deletion a user has made, from the mobile app's own
                Security screen — a genuine GDPR-style Data Subject Access Request trail, surfaced console-wide for
                the first time.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-2">
                <StatCard label="Data Exports" value={data.dsarLog.kpis.exports} />
                <StatCard label="Account Deletions" value={data.dsarLog.kpis.deletions} />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-3 py-2 font-normal">Type</th>
                      <th className="px-3 py-2 font-normal">User</th>
                      <th className="px-3 py-2 font-normal">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dsarLog.entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                              entry.type === "export" ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"
                            }`}
                          >
                            {entry.type === "export" ? "Data Export" : "Account Deletion"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-primary">{entry.user ? entry.user.fullName : "Deleted account (anonymized)"}</td>
                        <td className="px-3 py-2 text-text-dim">{fullDate(entry.createdAt)}</td>
                      </tr>
                    ))}
                    {data.dsarLog.entries.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-text-dim">
                          No data exports or account deletions yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {data.dsarLog.truncated && (
                  <p className="mt-2 text-[11px] text-text-dim">
                    Showing the most recent {data.dsarLog.entries.length} of {data.dsarLog.totalCount} events.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">Sensitive Data Access Log</div>
              <p className="mt-1 text-xs text-text-dim">
                Every ADMIN request to view a user's locked sensitive health data — a different, internal
                access-control record, not a self-service request. Requires supervisor approval and is logged.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Total Requests" value={data.sensitiveAccessLog.kpis.total} />
                <StatCard label="Pending" value={data.sensitiveAccessLog.kpis.pending} />
                <StatCard label="Approved" value={data.sensitiveAccessLog.kpis.approved} />
                <StatCard label="Denied" value={data.sensitiveAccessLog.kpis.denied} />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-3 py-2 font-normal">User</th>
                      <th className="px-3 py-2 font-normal">Requested By</th>
                      <th className="px-3 py-2 font-normal">Reason</th>
                      <th className="px-3 py-2 font-normal">Status</th>
                      <th className="px-3 py-2 font-normal">Reviewed By</th>
                      <th className="px-3 py-2 font-normal">Requested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sensitiveAccessLog.entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-3 py-2 text-text-primary">{entry.user.fullName}</td>
                        <td className="px-3 py-2 text-text-secondary">{entry.requestedByAdmin.fullName}</td>
                        <td className="max-w-xs truncate px-3 py-2 text-text-secondary" title={entry.reason}>
                          {entry.reason}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={entry.status} />
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{entry.reviewedByAdmin?.fullName ?? "—"}</td>
                        <td className="px-3 py-2 text-text-dim">{fullDate(entry.createdAt)}</td>
                      </tr>
                    ))}
                    {data.sensitiveAccessLog.entries.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-text-dim">
                          No sensitive data access requests yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {data.sensitiveAccessLog.truncated && (
                  <p className="mt-2 text-[11px] text-text-dim">
                    Showing the most recent {data.sensitiveAccessLog.entries.length} of {data.sensitiveAccessLog.totalCount} requests.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">Consent Management</div>
              <p className="mt-1 text-xs text-text-dim">
                Real, read-only per-user consent state (marketing emails, data analytics, health-data processing) —
                search for a user to view what they've granted or revoked.
              </p>
              <Link
                to="/admin-system/consents"
                className="mt-3 inline-flex items-center rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
              >
                Open Consent Management →
              </Link>
            </div>

            <NotAvailablePanel
              keys={data.notAvailable}
              subtitle="Data-retention policy needs an entity that doesn't exist anywhere in this schema."
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
