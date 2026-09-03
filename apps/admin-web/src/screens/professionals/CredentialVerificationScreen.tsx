import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminProfessionalDetailResponse,
  AdminProfessionalDirectoryResponse,
  AdminVerifyCredentialInput,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { PROFESSIONALS_SUB_NAV } from "./subNav";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

async function fetchQueue(): Promise<AdminProfessionalDirectoryResponse> {
  const res = await apiClient.get<AdminProfessionalDirectoryResponse>("/admin/professionals", {
    params: { tab: "pendingVerification" },
  });
  return res.data;
}

async function fetchDetail(id: string): Promise<AdminProfessionalDetailResponse> {
  const res = await apiClient.get<AdminProfessionalDetailResponse>(`/admin/professionals/${id}`);
  return res.data;
}

function DocLink({ label, dataUri }: { label: string; dataUri: string | null | undefined }) {
  if (!dataUri) return <span className="text-xs text-text-dim">{label}: not uploaded</span>;
  return (
    <a href={dataUri} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-accent hover:underline">
      <img src={dataUri} alt={label} className="h-10 w-10 rounded object-cover" />
      {label} — view full size
    </a>
  );
}

/**
 * 03.03 Credential Verification (docs/admin/03-screen-inventory.md §03) —
 * the actual approval workflow, added 21 Aug 2026. This is the first thing
 * in this whole build that can move a `ProfessionalCredential`/
 * `Professional.kycStatus` past `pending` — before this screen, every real
 * submission from apps/coach-mobile's onboarding was permanently stuck
 * there (see professionalOnboarding.service.ts's own comment).
 *
 * Split panel per the Figma: left is the Pending Review Queue (every
 * professional with >=1 pending credential or a pending KYC check — same
 * `pendingVerification` bucket the Directory tab uses); right is a detail
 * panel with one review block per credential PLUS a KYC block, each with
 * real Approve/Reject actions and an admin-notes field. "Request Info"
 * isn't wired (no `CredentialStatus` value represents it — see
 * adminProfessionals.service.ts) and "region flag"/"submitted date" columns
 * aren't shown in the queue list — no region field exists, and
 * `ProfessionalCredential` has no distinct submission timestamp separate
 * from `updatedAt`, so manufacturing a "submitted date" would imply more
 * precision than the data actually has.
 */
export function CredentialVerificationScreen() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const queueQuery = useQuery({ queryKey: ["admin-professionals-queue"], queryFn: fetchQueue });
  const detailQuery = useQuery({
    queryKey: ["admin-professional-detail", selectedId],
    queryFn: () => fetchDetail(selectedId as string),
    enabled: !!selectedId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-professionals-queue"] });
    queryClient.invalidateQueries({ queryKey: ["admin-professional-detail", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["admin-professionals"] });
  };

  const credentialMutation = useMutation({
    mutationFn: ({ credentialId, input }: { credentialId: string; input: AdminVerifyCredentialInput }) =>
      apiClient.patch(`/admin/professionals/${selectedId}/credentials/${credentialId}`, input),
    onSuccess: invalidateAll,
  });

  const kycMutation = useMutation({
    mutationFn: (input: AdminVerifyCredentialInput) => apiClient.patch(`/admin/professionals/${selectedId}/kyc`, input),
    onSuccess: invalidateAll,
  });

  const suspendMutation = useMutation({
    mutationFn: (adminNotes: string | undefined) =>
      apiClient.post(`/admin/professionals/${selectedId}/suspend`, { adminNotes }),
    onSuccess: invalidateAll,
  });

  const queue = queueQuery.data?.professionals ?? [];
  const detail = detailQuery.data;

  return (
    <AppShell title="Credential Verification" subNav={PROFESSIONALS_SUB_NAV}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-lg border border-border-subtle bg-surface">
          <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
            Pending Review Queue ({queue.length})
          </div>
          {queueQuery.isLoading && <p className="p-4 text-sm text-text-secondary">Loading…</p>}
          {queueQuery.isError && (
            <p className="p-4 text-sm text-danger">{extractErrorMessage(queueQuery.error, "Couldn't load the queue.")}</p>
          )}
          <ul className="divide-y divide-border-subtle">
            {queue.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`block w-full px-4 py-3 text-left transition-colors ${
                    selectedId === p.id ? "bg-accent/10" : "hover:bg-surface-raised"
                  }`}
                >
                  <div className="text-sm font-medium text-text-primary">{p.fullName}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.services
                      .filter((s) => s.status === "pending")
                      .map((s) => (
                        <span key={s.serviceType} className="rounded-full border border-warning/40 px-2 py-0.5 text-[10px] text-warning">
                          {SERVICE_LABELS[s.serviceType] ?? s.serviceType}
                        </span>
                      ))}
                    {p.kycStatus === "pending" && (
                      <span className="rounded-full border border-warning/40 px-2 py-0.5 text-[10px] text-warning">KYC</span>
                    )}
                  </div>
                </button>
              </li>
            ))}
            {!queueQuery.isLoading && queue.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-text-dim">Nothing awaiting review.</li>
            )}
          </ul>
        </div>

        <div className="space-y-4">
          {!selectedId && (
            <div className="rounded-lg border border-dashed border-border-subtle bg-surface/50 p-8 text-center text-sm text-text-dim">
              Select an applicant from the queue to review their credentials.
            </div>
          )}

          {selectedId && detailQuery.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

          {detail && (
            <>
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">{detail.professional.fullName}</h3>
                  <StatusBadge status={detail.professional.status} />
                </div>
                <div className="text-sm text-text-secondary">{detail.professional.email}</div>
              </div>

              {detail.professional.credentials.map((c) => (
                <div key={c.id} className="rounded-lg border border-border-subtle bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{SERVICE_LABELS[c.serviceType] ?? c.serviceType} Credential Review</div>
                    <StatusBadge status={c.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <div>
                      <dt className="text-text-dim">Qualification</dt>
                      <dd>{c.certificationName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-text-dim">Issuing body</dt>
                      <dd>{c.certifyingBody ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-text-dim">Year obtained</dt>
                      <dd>{c.yearObtained ?? "—"}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-4">
                    <DocLink label="Certification document" dataUri={c.certificationDocData} />
                    <DocLink label="Qualification certificate" dataUri={c.qualificationDocData} />
                  </div>
                  <textarea
                    placeholder="Admin notes (optional)"
                    value={notes[c.id] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    className="mt-3 w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                    rows={2}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={c.status === "not_verified" || credentialMutation.isPending}
                      onClick={() =>
                        credentialMutation.mutate({ credentialId: c.id, input: { status: "verified", adminNotes: notes[c.id] } })
                      }
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={c.status === "not_verified" || credentialMutation.isPending}
                      onClick={() =>
                        credentialMutation.mutate({ credentialId: c.id, input: { status: "rejected", adminNotes: notes[c.id] } })
                      }
                      className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Not built — CredentialStatus has no 'info requested' state, see adminProfessionals.service.ts"
                      className="cursor-not-allowed rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-dim"
                    >
                      Request Info
                    </button>
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Government KYC Identity Check</div>
                  <StatusBadge status={detail.professional.kycStatus} />
                </div>
                <div className="mt-3">
                  <DocLink label="Government ID (e.g. Aadhaar)" dataUri={detail.professional.kycDocumentData} />
                </div>
                <textarea
                  placeholder="Admin notes (optional)"
                  value={notes.kyc ?? ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, kyc: e.target.value }))}
                  className="mt-3 w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                  rows={2}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={detail.professional.kycStatus === "not_verified" || kycMutation.isPending}
                    onClick={() => kycMutation.mutate({ status: "verified", adminNotes: notes.kyc })}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={detail.professional.kycStatus === "not_verified" || kycMutation.isPending}
                    onClick={() => kycMutation.mutate({ status: "rejected", adminNotes: notes.kyc })}
                    className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
                <div className="text-sm font-medium text-danger">Suspend Application</div>
                <p className="mt-1 text-xs text-text-secondary">
                  Sets this professional's account status to Suspended — reversible from the Directory.
                </p>
                <button
                  type="button"
                  disabled={suspendMutation.isPending || detail.professional.status === "suspended"}
                  onClick={() => suspendMutation.mutate(notes.suspend)}
                  className="mt-2 rounded-md border border-danger px-3 py-1.5 text-xs text-danger disabled:opacity-40"
                >
                  {detail.professional.status === "suspended" ? "Already suspended" : "Suspend Application"}
                </button>
              </div>

              {(credentialMutation.isError || kycMutation.isError || suspendMutation.isError) && (
                <p className="text-xs text-danger">
                  {extractErrorMessage(
                    credentialMutation.error ?? kycMutation.error ?? suspendMutation.error,
                    "That action didn't go through — check your connection and try again.",
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
