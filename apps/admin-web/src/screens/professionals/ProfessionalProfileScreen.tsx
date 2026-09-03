import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { AdminProfessionalDetailResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { PROFESSIONALS_SUB_NAV } from "./subNav";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

type Tab = "overview" | "clients" | "sessions" | "earnings" | "reviews" | "credentials";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "clients", label: "Clients" },
  { key: "sessions", label: "Sessions" },
  { key: "earnings", label: "Earnings" },
  { key: "reviews", label: "Reviews" },
  { key: "credentials", label: "Credentials" },
];

async function fetchDetail(id: string): Promise<AdminProfessionalDetailResponse> {
  const res = await apiClient.get<AdminProfessionalDetailResponse>(`/admin/professionals/${id}`);
  return res.data;
}

/**
 * 03.02 Professional Profile (docs/admin/03-screen-inventory.md §03) —
 * Overview/Clients/Credentials are real; Sessions/Earnings/Reviews render
 * an honest "not available" panel instead of the tab's real content — no
 * Booking/session log, per-professional payment ledger, or Review model
 * exists in this schema. The Credentials tab reuses the same
 * verify/reject actions as the dedicated Credential Verification queue
 * (03.03) — this is just a second, per-professional entry point to the
 * same real endpoints, not a separate implementation.
 */
export function ProfessionalProfileScreen() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-professional-detail", id],
    queryFn: () => fetchDetail(id as string),
    enabled: !!id,
  });

  return (
    <AppShell title="Professional Profile" subNav={PROFESSIONALS_SUB_NAV}>
      {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

      {isError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {extractErrorMessage(error, "Couldn't load this professional.")}
          <button type="button" onClick={() => refetch()} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface p-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{data.professional.fullName}</h2>
                <StatusBadge status={data.professional.status} />
              </div>
              <div className="mt-1 text-sm text-text-secondary">{data.professional.email}</div>
              {data.professional.phone && <div className="text-xs text-text-dim">{data.professional.phone}</div>}
              <div className="mt-2 flex flex-wrap gap-1">
                {data.professional.credentials.map((c) => (
                  <span key={c.id} className="flex items-center gap-1 rounded-full border border-border-subtle px-2 py-0.5 text-[11px]">
                    {SERVICE_LABELS[c.serviceType] ?? c.serviceType}
                    <StatusBadge status={c.status} />
                  </span>
                ))}
              </div>
            </div>
            <Link to="/professionals" className="text-xs text-text-secondary hover:text-text-primary">
              ← Back to Directory
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  tab === t.key
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border-subtle text-text-secondary hover:text-text-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-text-dim">Profile</div>
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Years experience" value={data.professional.yearsExperience ?? "—"} />
                  <Row label="Specializations" value={data.professional.specializationTags.join(", ") || "—"} />
                  <Row label="Bio" value={data.professional.bio ?? "—"} />
                  <Row label="Joined" value={new Date(data.professional.createdAt).toLocaleDateString()} />
                </dl>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-text-dim">Identity Verification (KYC)</div>
                  <StatusBadge status={data.professional.kycStatus} />
                </div>
                {data.professional.adminNotes && (
                  <p className="mt-3 text-xs text-text-secondary">Notes: {data.professional.adminNotes}</p>
                )}
                <p className="mt-3 text-[11px] text-text-dim">
                  Review and approve/reject KYC from the Credential Verification queue.
                </p>
              </div>
            </div>
          )}

          {tab === "clients" && (
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">Client</th>
                    <th className="px-4 py-3 font-normal">Service</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal">Since</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clients.map((c) => (
                    <tr key={c.relationshipId} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{c.userFullName}</div>
                        <div className="text-xs text-text-dim">{c.userEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{SERVICE_LABELS[c.serviceType] ?? c.serviceType}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{new Date(c.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.clients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-text-dim">
                        No clients yet — real `Relationship` rows only exist once the (still unbuilt) coach
                        discovery/booking flow creates one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "credentials" && (
            <div className="space-y-3">
              {data.professional.credentials.length === 0 && (
                <p className="text-sm text-text-dim">No services selected yet.</p>
              )}
              {data.professional.credentials.map((c) => (
                <div key={c.id} className="rounded-lg border border-border-subtle bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{SERVICE_LABELS[c.serviceType] ?? c.serviceType} Credential</div>
                    <StatusBadge status={c.status} />
                  </div>
                  <dl className="mt-2 space-y-1 text-xs text-text-secondary">
                    <Row label="Certification" value={c.certificationName ?? "—"} />
                    <Row label="Certifying body" value={c.certifyingBody ?? "—"} />
                    <Row label="Year obtained" value={c.yearObtained ?? "—"} />
                    {c.adminNotes && <Row label="Admin notes" value={c.adminNotes} />}
                  </dl>
                  <Link to="/professionals/verification" className="mt-3 inline-block text-xs text-accent hover:underline">
                    Review in Credential Verification →
                  </Link>
                </div>
              ))}
            </div>
          )}

          {(tab === "sessions" || tab === "earnings" || tab === "reviews") && (
            <NotAvailablePanel
              keys={[tab]}
              subtitle="No backing entity exists yet for this tab — see adminProfessionals.service.ts's doc comment."
            />
          )}
        </div>
      )}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-dim">{label}</dt>
      <dd className="text-right text-text-secondary">{value}</dd>
    </div>
  );
}
