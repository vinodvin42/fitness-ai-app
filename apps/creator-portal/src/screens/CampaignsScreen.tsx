import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

interface Campaign {
  id: string;
  name: string;
  linkCode: string;
  status: string;
  createdAt: string;
}

/**
 * Campaigns list. DESIGN-PENDING.
 *
 * Deliberately read-only: a creator does not create or edit their own
 * campaigns in R1 — those are set up by FynroX with agreed terms, and a
 * self-serve campaign builder would be the "creator publishing tools"
 * the Overview puts out of scope.
 */
export function CampaignsScreen() {
  const campaigns = useQuery({
    queryKey: ["creatorCampaigns"],
    queryFn: async () => (await apiClient.get<{ campaigns: Campaign[] } | Campaign[]>("/influencer-portal/campaigns")).data,
  });

  if (campaigns.isLoading) {
    return (
      <AppShell title="Campaigns">
        <p className="text-sm text-text-dim">Loading…</p>
      </AppShell>
    );
  }
  if (campaigns.isError || !campaigns.data) {
    return (
      <AppShell title="Campaigns">
        <p className="text-sm text-danger">{extractErrorMessage(campaigns.error, "Couldn't load your campaigns.")}</p>
      </AppShell>
    );
  }

  const rows = Array.isArray(campaigns.data) ? campaigns.data : campaigns.data.campaigns ?? [];

  return (
    <AppShell title="Campaigns">
      {rows.length === 0 ? (
        <p className="text-sm text-text-dim">
          No campaigns are credited to you yet — your FynroX contact will set one up and it'll appear here.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-dim">
              <th className="py-2 pr-4">Campaign</th>
              <th className="py-2 pr-4">Code</th>
              <th className="py-2 pr-4">Started</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border-subtle/60">
                <td className="py-3 pr-4 text-text-primary">{c.name}</td>
                <td className="py-3 pr-4 font-mono text-text-secondary">{c.linkCode}</td>
                <td className="py-3 pr-4 text-text-secondary">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className="py-3 pr-4">
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-6 max-w-2xl text-xs text-text-dim">
        Campaign performance is reported as totals only. FynroX never shares who signed up, what they train, what they
        eat, or anything about their health.
      </p>
    </AppShell>
  );
}
