import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminAcquisitionSourcesResponse,
  AdminCampaignListResponse,
  AdminInfluencerListResponse,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { GROWTH_SUB_NAV } from "../growth/subNav";

const CHANNEL_LABELS: Record<string, string> = {
  organic: "Organic",
  paid_search: "Paid Search",
  paid_social: "Paid Social",
  referral: "Referral",
  influencer: "Influencer",
  gym_partner: "Gym Partner",
  direct: "Direct",
};

/** Minimal, local — the real `GET /admin/gyms` list this reuses for the
 * dropdown belongs to a parallel Wave 4 unit (Gym admin CRUD) that hasn't
 * shipped its own shared `packages/types` entry yet, so this screen types
 * only the two fields it actually reads rather than guessing at that
 * unit's full response shape. */
interface GymListItem {
  id: string;
  name: string;
}
interface GymListResponse {
  gyms: GymListItem[];
}

async function fetchCampaigns(): Promise<AdminCampaignListResponse> {
  const res = await apiClient.get<AdminCampaignListResponse>("/admin/acquisition/campaigns");
  return res.data;
}

async function fetchSources(): Promise<AdminAcquisitionSourcesResponse> {
  const res = await apiClient.get<AdminAcquisitionSourcesResponse>("/admin/acquisition/sources");
  return res.data;
}

async function fetchInfluencers(): Promise<AdminInfluencerListResponse> {
  const res = await apiClient.get<AdminInfluencerListResponse>("/admin/influencers");
  return res.data;
}

async function fetchGyms(): Promise<GymListResponse> {
  const res = await apiClient.get<GymListResponse>("/admin/gyms");
  return res.data;
}

/**
 * 07.04 Campaigns & Attribution — Campaign Directory half (docs/admin/
 * 03-screen-inventory.md §07.04), added 20 Sep 2026 (R2 Wave 4). R2 Wave 1
 * (same day) shipped the real `AcquisitionSource`/`Campaign`/`Touchpoint`
 * schema and signup-time resolution but no admin-web UI — this is that UI's
 * directory/CRUD half (the report half is `AcquisitionReportScreen.tsx`).
 *
 * The Source dropdown is populated from the 7 real, seeded
 * `AcquisitionSource` rows (`GET /admin/acquisition/sources`) — this screen
 * does NOT let an admin invent a new channel/taxonomy value, per this
 * wave's own explicit "no self-service taxonomy editor" scope boundary.
 * Influencer/Gym association is optional (BR-ACQ-002: a campaign may credit
 * neither, either, or both) and reuses the real, already-existing
 * `GET /admin/influencers` / `GET /admin/gyms` directories for their
 * dropdowns rather than duplicating those lists.
 */
export function CampaignDirectoryScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [influencerId, setInfluencerId] = useState("");
  const [gymId, setGymId] = useState("");

  const campaigns = useQuery({ queryKey: ["admin-campaigns"], queryFn: fetchCampaigns });
  const sources = useQuery({ queryKey: ["admin-acquisition-sources"], queryFn: fetchSources });
  const influencers = useQuery({ queryKey: ["admin-influencers-for-campaign-form"], queryFn: fetchInfluencers });
  const gyms = useQuery({ queryKey: ["admin-gyms-for-campaign-form"], queryFn: fetchGyms });

  const resetForm = () => {
    setName("");
    setSourceId("");
    setLinkCode("");
    setStatus("active");
    setInfluencerId("");
    setGymId("");
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/admin/acquisition/campaigns", {
        name,
        sourceId,
        linkCode,
        status,
        influencerId: influencerId || undefined,
        gymId: gymId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      setShowForm(false);
      resetForm();
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: "active" | "inactive" }) =>
      apiClient.patch(`/admin/acquisition/campaigns/${id}`, { status: nextStatus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] }),
  });

  return (
    <AppShell title={t("campaignDirectory.campaigns")} subNav={GROWTH_SUB_NAV}>
      <div className="space-y-4">
        {campaigns.data && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t("campaignDirectory.totalCampaigns")} value={campaigns.data.counts.total} />
            <StatCard label={t("campaignDirectory.active")} value={campaigns.data.counts.active} />
          </div>
        )}

        <div className="flex items-center justify-end rounded-lg border border-border-subtle bg-surface p-4">
          <button
            type="button"
            onClick={() => setShowForm((p) => !p)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
          >
            {showForm ? "Cancel" : "+ New Campaign"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="grid grid-cols-1 gap-3 rounded-lg border border-border-subtle bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6"
          >
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              {t("campaignDirectory.name")}
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              {t("campaignDirectory.source")}
              <select
                required
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="" disabled>
                  {t("campaignDirectory.select")}
                </option>
                {sources.data?.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              {t("campaignDirectory.linkCode2")}
              <input
                required
                placeholder={t("campaignDirectory.igReelsSep")}
                value={linkCode}
                onChange={(e) => setLinkCode(e.target.value)}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              {t("campaignDirectory.status")}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="active">{t("campaignDirectory.active")}</option>
                <option value="inactive">{t("campaignDirectory.inactive")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              {t("campaignDirectory.influencerOptional")}
              <select
                value={influencerId}
                onChange={(e) => setInfluencerId(e.target.value)}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="">None</option>
                {influencers.data?.influencers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              {t("campaignDirectory.gymOptional")}
              <select
                value={gymId}
                onChange={(e) => setGymId(e.target.value)}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="">None</option>
                {gyms.data?.gyms.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={createMutation.isPending || !sourceId}
              className="self-end rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {createMutation.isPending ? "Saving…" : "Create"}
            </button>
          </form>
        )}

        {createMutation.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(createMutation.error, "Couldn't create that campaign.")}
          </div>
        )}

        {campaigns.isLoading && <p className="text-sm text-text-secondary">{t("campaignDirectory.loading")}</p>}
        {campaigns.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(campaigns.error, "Couldn't load campaigns.")}
            <button type="button" onClick={() => campaigns.refetch()} className="ml-3 underline">
              {t("campaignDirectory.retry")}
            </button>
          </div>
        )}

        {campaigns.data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">{t("campaignDirectory.campaign")}</th>
                  <th className="px-4 py-3 font-normal">{t("campaignDirectory.channel")}</th>
                  <th className="px-4 py-3 font-normal">{t("campaignDirectory.linkCode")}</th>
                  <th className="px-4 py-3 font-normal">{t("campaignDirectory.influencer")}</th>
                  <th className="px-4 py-3 font-normal">{t("campaignDirectory.gym")}</th>
                  <th className="px-4 py-3 font-normal">{t("campaignDirectory.status")}</th>
                  <th className="px-4 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.data.campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{c.name}</div>
                      <div className="text-xs text-text-dim">{new Date(c.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{CHANNEL_LABELS[c.channel] ?? c.channel}</td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-secondary">{c.linkCode}</code>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{c.influencer?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-text-secondary">{c.gym?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={toggleStatusMutation.isPending && toggleStatusMutation.variables?.id === c.id}
                        onClick={() =>
                          toggleStatusMutation.mutate({ id: c.id, nextStatus: c.status === "active" ? "inactive" : "active" })
                        }
                        className="text-xs text-accent hover:underline disabled:opacity-50"
                      >
                        {c.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
                {campaigns.data.campaigns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-dim">
                      {t("campaignDirectory.noCampaignsYet")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
