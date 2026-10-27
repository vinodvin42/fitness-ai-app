import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { AdminProfessionalDetailResponse, UpdateMaxActiveClientsInput } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { StatCard } from "../../components/StatCard";
import { useCan } from "../../lib/permissions";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { PROFESSIONALS_SUB_NAV } from "./subNav";
import { PayoutDetailsPanel } from "./PayoutDetailsPanel";

const MIN_CAPACITY = 1;
const MAX_CAPACITY = 500;

const LIFECYCLE_PRECONDITION_NOTE: Record<string, string> = {
  application: "Hasn't submitted a service credential yet.",
  verification: "Awaiting KYC and/or credential verification (Credentials tab).",
  approved: "Approved, but not yet Available — needs at least one verified service credential. Moves to Available automatically once one clears.",
  available: "Open for new-client matching, subject to the capacity below.",
  suspended: "Account is suspended — overrides lifecycle stage for new-client matching.",
};

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
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [draftCapacity, setDraftCapacity] = useState("");
  const [draftGender, setDraftGender] = useState<"" | "male" | "female">("");
  const queryClient = useQueryClient();
  // Hide what this role can't do (the API still checks every call).
  const canEdit = useCan("professionals", "edit");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-professional-detail", id],
    queryFn: () => fetchDetail(id as string),
    enabled: !!id,
  });

  useEffect(() => {
    if (data) setDraftCapacity(String(data.professional.maxActiveClients));
  }, [data?.professional.maxActiveClients]);

  useEffect(() => {
    if (data) setDraftGender(data.professional.gender ?? "");
  }, [data?.professional.gender]);

  // Coach gender (20 Oct 2026): members can ask for a male or female coach, and a
  // request only goes to a coach of that gender. The coach can state it in the coach
  // app; an admin can set or correct it here (PATCH /admin/professionals/:id/gender).
  const genderMutation = useMutation({
    mutationFn: (gender: "male" | "female" | null) => apiClient.patch(`/admin/professionals/${id}/gender`, { gender }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-professional-detail", id] }),
  });

  // R2 Wave 2 (20 Sep 2026) — admin override for `maxActiveClients`, the
  // same `PATCH /admin/professionals/:id/capacity` endpoint R2 Wave 1
  // shipped with no UI caller anywhere (`requirePermission("professionals",
  // "edit")` gates it server-side; the input is hidden for roles without it).
  const capacityMutation = useMutation({
    mutationFn: (input: UpdateMaxActiveClientsInput) => apiClient.patch(`/admin/professionals/${id}/capacity`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-professional-detail", id] }),
  });

  const parsedCapacity = Number.parseInt(draftCapacity, 10);
  const isValidCapacity = Number.isInteger(parsedCapacity) && parsedCapacity >= MIN_CAPACITY && parsedCapacity <= MAX_CAPACITY;
  const isDirty = data != null && isValidCapacity && parsedCapacity !== data.professional.maxActiveClients;

  return (
    <AppShell title={t("professionalProfile.professionalProfile")} subNav={PROFESSIONALS_SUB_NAV}>
      {isLoading && <p className="text-sm text-text-secondary">{t("professionalProfile.loading")}</p>}

      {isError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {extractErrorMessage(error, "Couldn't load this professional.")}
          <button type="button" onClick={() => refetch()} className="ml-3 underline">
            {t("professionalProfile.retry")}
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface shadow-xs p-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{data.professional.fullName}</h2>
                <StatusBadge status={data.professional.status} />
                <StatusBadge status={data.professional.lifecycleStatus} />
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
              {t("professionalProfile.backToDirectory")}
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
              <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
                <div className="text-xs uppercase tracking-wide text-text-dim">{t("professionalProfile.profile")}</div>
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label={t("professionalProfile.yearsExperience")} value={data.professional.yearsExperience ?? "—"} />
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-text-dim">Gender</dt>
                    <dd className="flex items-center gap-2 text-right text-text-secondary">
                      {canEdit ? (
                        <>
                          <select
                            aria-label="Coach gender"
                            value={draftGender}
                            onChange={(e) => setDraftGender(e.target.value as "" | "male" | "female")}
                            disabled={genderMutation.isPending}
                            className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1 text-sm text-text-primary"
                          >
                            <option value="">Not stated</option>
                            <option value="female">Female</option>
                            <option value="male">Male</option>
                          </select>
                          <button
                            type="button"
                            disabled={genderMutation.isPending || draftGender === (data.professional.gender ?? "")}
                            onClick={() => genderMutation.mutate(draftGender === "" ? null : draftGender)}
                            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-canvas disabled:opacity-40"
                          >
                            {genderMutation.isPending ? "Saving…" : "Save"}
                          </button>
                        </>
                      ) : (
                        <span className="capitalize">{data.professional.gender ?? "Not stated"}</span>
                      )}
                    </dd>
                  </div>
                  <Row label={t("professionalProfile.specializations")} value={data.professional.specializationTags.join(", ") || "—"} />
                  <Row label={t("professionalProfile.bio")} value={data.professional.bio ?? "—"} />
                  <Row label={t("professionalProfile.joined")} value={new Date(data.professional.createdAt).toLocaleDateString()} />
                </dl>
              </div>
              <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-text-dim">{t("professionalProfile.identityVerificationKyc")}</div>
                  <StatusBadge status={data.professional.kycStatus} />
                </div>
                {data.professional.adminNotes && (
                  <p className="mt-3 text-xs text-text-secondary">Notes: {data.professional.adminNotes}</p>
                )}
                <p className="mt-3 text-[11px] text-text-dim">
                  {t("professionalProfile.reviewAndApproveReject")}
                </p>
              </div>

              <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-text-dim">{t("professionalProfile.lifecycleCapacity")}</div>
                  <StatusBadge status={data.professional.lifecycleStatus} />
                </div>
                <p className="mt-2 text-xs text-text-secondary">
                  {LIFECYCLE_PRECONDITION_NOTE[data.professional.lifecycleStatus] ?? ""}
                </p>

                <div className="mt-4 flex flex-wrap items-end gap-4">
                  <div>
                    <div className="text-[11px] text-text-dim">{t("professionalProfile.activeClients")}</div>
                    <div className="text-sm text-text-primary">
                      {data.clients.filter((c) => c.status === "active").length} of {data.professional.maxActiveClients}
                    </div>
                  </div>

                  {canEdit && (
                    <div>
                      <label className="text-[11px] text-text-dim" htmlFor="max-active-clients">
                        Max active clients (admin override, {MIN_CAPACITY}–{MAX_CAPACITY})
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          id="max-active-clients"
                          type="number"
                          min={MIN_CAPACITY}
                          max={MAX_CAPACITY}
                          step={1}
                          value={draftCapacity}
                          onChange={(e) => setDraftCapacity(e.target.value)}
                          disabled={capacityMutation.isPending}
                          className="w-24 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          disabled={!isDirty || capacityMutation.isPending}
                          onClick={() => capacityMutation.mutate({ maxActiveClients: parsedCapacity })}
                          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                        >
                          {capacityMutation.isPending ? "Saving…" : "Save"}
                        </button>
                      </div>
                      {!isValidCapacity && draftCapacity.length > 0 && (
                        <p className="mt-1 text-[11px] text-danger">
                          Enter a whole number between {MIN_CAPACITY} and {MAX_CAPACITY}.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {capacityMutation.isError && (
                  <p className="mt-3 text-xs text-danger">
                    {extractErrorMessage(capacityMutation.error, "Couldn't update capacity.")}
                  </p>
                )}
                {capacityMutation.isSuccess && !capacityMutation.isPending && (
                  <p className="mt-3 text-xs text-accent">{t("professionalProfile.capacityUpdated")}</p>
                )}
              </div>

              {/* Coach payout details (27 Oct 2026): masked view, verify/reject, reason-gated reveal. */}
              <PayoutDetailsPanel professionalId={data.professional.id} />
            </div>
          )}

          {tab === "clients" && (
            <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">{t("professionalProfile.client")}</th>
                    <th className="px-4 py-3 font-normal">{t("professionalProfile.service")}</th>
                    <th className="px-4 py-3 font-normal">{t("professionalProfile.status")}</th>
                    <th className="px-4 py-3 font-normal">{t("professionalProfile.since")}</th>
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
                        No clients yet. A client appears here once a member books this coach or the team matches them.
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
                <p className="text-sm text-text-dim">{t("professionalProfile.noServicesSelectedYet")}</p>
              )}
              {data.professional.credentials.map((c) => (
                <div key={c.id} className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{SERVICE_LABELS[c.serviceType] ?? c.serviceType} Credential</div>
                    <StatusBadge status={c.status} />
                  </div>
                  <dl className="mt-2 space-y-1 text-xs text-text-secondary">
                    <Row label={t("professionalProfile.certification")} value={c.certificationName ?? "—"} />
                    <Row label={t("professionalProfile.certifyingBody")} value={c.certifyingBody ?? "—"} />
                    <Row label={t("professionalProfile.yearObtained")} value={c.yearObtained ?? "—"} />
                    {c.adminNotes && <Row label={t("professionalProfile.adminNotes")} value={c.adminNotes} />}
                  </dl>
                  <Link to="/professionals/verification" className="mt-3 inline-block text-xs text-accent hover:underline">
                    {t("professionalProfile.reviewInCredentialVerification")}
                  </Link>
                </div>
              ))}
            </div>
          )}

          {tab === "sessions" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Booked" value={data.activity.summary.total} />
                <StatCard label="Upcoming" value={data.activity.summary.upcoming} />
                <StatCard label="Delivered" value={data.activity.summary.delivered} />
                <StatCard label="Cancelled" value={data.activity.summary.cancelled} />
              </div>
              <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-4 py-3 font-normal">When</th>
                      <th className="px-4 py-3 font-normal">Client</th>
                      <th className="px-4 py-3 font-normal">Service</th>
                      <th className="px-4 py-3 font-normal">Price</th>
                      <th className="px-4 py-3 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activity.sessions.map((s) => (
                      <tr key={s.bookingId} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-3 text-text-secondary">{new Date(s.scheduledAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-text-primary">{s.userFullName}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          {s.serviceLabel} · {s.durationMinutes} min
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{rupees(s.priceCents)}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          {s.status === "cancelled" ? "Cancelled" : new Date(s.scheduledAt) > new Date() ? "Upcoming" : "Delivered"}
                        </td>
                      </tr>
                    ))}
                    {data.activity.sessions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-text-dim">No sessions booked yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "earnings" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Sessions delivered" value={data.activity.earnings.sessionsDelivered} />
                <StatCard label="Booked value" value={rupees(data.activity.earnings.grossCents)} />
                <StatCard label="Fynrox commission" value={rupees(data.activity.earnings.commissionCents)} />
                <StatCard label="Coach earnings" value={rupees(data.activity.earnings.netCents)} />
              </div>
              <p className="text-xs text-text-dim">
                All time, delivered sessions only, using each booking's own commission rate (the same rule as Finance → Settlements).
              </p>
            </div>
          )}

          {tab === "reviews" && <NotAvailablePanel keys={["reviews"]} subtitle="Clients can't leave reviews yet." />}
        </div>
      )}
    </AppShell>
  );
}

function rupees(cents: number): string {
  return `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-dim">{label}</dt>
      <dd className="text-right text-text-secondary">{value}</dd>
    </div>
  );
}
