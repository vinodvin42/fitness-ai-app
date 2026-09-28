import { useQuery } from "@tanstack/react-query";
import type {
  InfluencerPortalAcquisitionReportResponse,
  InfluencerPortalCampaignsResponse,
  InfluencerPortalPayoutsResponse,
} from "@fitness-ai-app/types";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";
import { useAuth } from "../lib/auth";
import { AppShell } from "../components/AppShell";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

async function fetchCampaigns(): Promise<InfluencerPortalCampaignsResponse> {
  const res = await apiClient.get<InfluencerPortalCampaignsResponse>("/influencer-portal/campaigns");
  return res.data;
}

async function fetchReport(): Promise<InfluencerPortalAcquisitionReportResponse> {
  const res = await apiClient.get<InfluencerPortalAcquisitionReportResponse>(
    "/influencer-portal/acquisition-report",
  );
  return res.data;
}

async function fetchPayouts(): Promise<InfluencerPortalPayoutsResponse> {
  const res = await apiClient.get<InfluencerPortalPayoutsResponse>("/influencer-portal/payouts");
  return res.data;
}

/**
 * The real Creator Portal dashboard (R2 Wave 5, 21 Sep 2026) — an
 * influencer's own profile, their own Campaign link code(s), a per-campaign
 * attribution report scoped to just those campaigns (reusing
 * adminAcquisition.service.ts's own real aggregation, see
 * influencerPortal.service.ts), and their own InfluencerPayout history.
 * Every request here is authenticated as this influencer and the backend
 * filters by their own id only — see influencerPortal.routes.ts's own doc
 * comment for the boundary-discipline guarantee.
 */
export function DashboardScreen() {
  const { influencer } = useAuth();

  const campaigns = useQuery({ queryKey: ["creator-campaigns"], queryFn: fetchCampaigns });
  const report = useQuery({ queryKey: ["creator-report"], queryFn: fetchReport });
  const payouts = useQuery({ queryKey: ["creator-payouts"], queryFn: fetchPayouts });

  // Wrapped in the shared AppShell as of the R1 build-out: this screen
  // predates the portal having any navigation, so it carried its own
  // header and sign-out. Leaving it that way would mean one screen that
  // looks like a different product from the five around it.
  return (
    <AppShell title="Dashboard">

      <section className="mb-6 rounded-lg border border-border-subtle bg-surface p-4">
        <div className="mb-3 text-sm font-medium text-text-primary">Your profile</div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-text-dim">Email</div>
            <div className="text-text-secondary">{influencer?.email ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-text-dim">Handle</div>
            <div className="text-text-secondary">{influencer?.handle ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-text-dim">Platform</div>
            <div className="text-text-secondary">{influencer?.platform ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-text-dim">Commission</div>
            <div className="text-text-secondary">{influencer?.commissionPct}%</div>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-3 text-sm font-medium text-text-primary">Your campaigns &amp; link codes</div>
        {campaigns.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {campaigns.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(campaigns.error, "Couldn't load your campaigns.")}
          </div>
        )}
        {campaigns.data && campaigns.data.campaigns.length === 0 && (
          <p className="text-sm text-text-dim">No campaigns are credited to you yet — ask your FynroX contact.</p>
        )}
        {campaigns.data && campaigns.data.campaigns.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">Campaign</th>
                  <th className="px-4 py-3 font-normal">Link code</th>
                  <th className="px-4 py-3 font-normal">Channel</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.data.campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 text-text-primary">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{c.linkCode}</td>
                    <td className="px-4 py-3 text-text-secondary">{c.sourceLabel}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-3 text-sm font-medium text-text-primary">Your attribution (all-time)</div>
        {report.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {report.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(report.error, "Couldn't load your attribution report.")}
          </div>
        )}
        {report.data && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Registrations" value={report.data.totals.registrations} />
              <StatCard label="Activated" value={report.data.totals.activatedUsers} />
              <StatCard label="First workout" value={report.data.totals.usersWithFirstWorkout} />
              <StatCard label="Paid conversions" value={report.data.totals.paidConversions} />
            </div>
            {report.data.byCampaign.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-4 py-3 font-normal">Campaign</th>
                      <th className="px-4 py-3 font-normal">Registrations</th>
                      <th className="px-4 py-3 font-normal">Activated</th>
                      <th className="px-4 py-3 font-normal">First workout</th>
                      <th className="px-4 py-3 font-normal">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.byCampaign.map((row) => (
                      <tr key={row.campaignId} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-3 text-text-primary">{row.campaignName}</td>
                        <td className="px-4 py-3 text-text-secondary">{row.registrations}</td>
                        <td className="px-4 py-3 text-text-secondary">{row.activatedUsers}</td>
                        <td className="px-4 py-3 text-text-secondary">{row.usersWithFirstWorkout}</td>
                        <td className="px-4 py-3 text-text-secondary">{row.paidConversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <div className="mb-3 text-sm font-medium text-text-primary">Your payout history</div>
        {payouts.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {payouts.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(payouts.error, "Couldn't load your payouts.")}
          </div>
        )}
        {payouts.data && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Paid" value={money(payouts.data.counts.paidCents)} />
              <StatCard label="Pending" value={money(payouts.data.counts.pendingCents)} />
              <StatCard label="Total payouts" value={payouts.data.counts.total} />
            </div>
            {payouts.data.payouts.length === 0 ? (
              <p className="text-sm text-text-dim">No payouts recorded yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
                <table className="w-full text-left text-sm">
                  <tbody>
                    {payouts.data.payouts.map((p) => (
                      <tr key={p.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-3 text-text-secondary">{p.periodLabel}</td>
                        <td className="px-4 py-3 text-text-primary">{money(p.amountCents)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
