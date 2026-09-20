import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type {
  AddGymLocationInput,
  AdminGymDetailResponse,
  AdminGymMemberActivationSummary,
  UpdateGymCommercialInput,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { ReasonGatedAction } from "../../components/ReasonGatedAction";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";

async function fetchDetail(id: string): Promise<AdminGymDetailResponse> {
  const res = await apiClient.get<AdminGymDetailResponse>(`/admin/gyms/${id}`);
  return res.data;
}

async function fetchMemberActivationSummary(id: string): Promise<AdminGymMemberActivationSummary> {
  const res = await apiClient.get<AdminGymMemberActivationSummary>(`/admin/gyms/${id}/member-activation-summary`);
  return res.data;
}

/**
 * Gym Partner Lite (R2 Wave 4, 20 Sep 2026) — the real admin-web detail
 * screen over R2 Wave 1's real `gyms.service.ts`. Contact info, real
 * locations (list + add-location form against `POST /admin/gyms/:id/locations`),
 * editable commercial fields (`PATCH /admin/gyms/:id/commercial`), real
 * status transitions (`PATCH /admin/gyms/:id/status` — Approve is a plain
 * button since `application -> approved` is the normal onboarding path, not
 * a destructive action; Suspend uses `ReasonGatedAction` since it's the
 * high-impact one, same BR-ADM-005 discipline as Professional
 * Suspend/`RelationshipDetailScreen`'s End Relationship), and the real
 * member-activation summary from `getMemberActivationSummary()`.
 *
 * `ratePerMemberCents` is shown with an explicit "not configured" label
 * while it's 0 — see `gyms.service.ts#getGymDetail`'s own doc comment
 * (`ratePerMemberConfigured`) for why 0 is an inert placeholder, not a real
 * free rate, and preserve that framing here rather than silently showing
 * "₹0.00/member" as if it were a real negotiated rate.
 */
export function GymProfileScreen() {
  const { id } = useParams<{ id: string }>();
  const [locationForm, setLocationForm] = useState<AddGymLocationInput>({ name: "", address: "", equipment: "" });
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [commercialForm, setCommercialForm] = useState<UpdateGymCommercialInput | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-gym-detail", id],
    queryFn: () => fetchDetail(id as string),
    enabled: !!id,
  });

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["admin-gym-member-activation-summary", id],
    queryFn: () => fetchMemberActivationSummary(id as string),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-gym-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-gyms"] });
  };

  const addLocationMutation = useMutation({
    mutationFn: (input: AddGymLocationInput) => apiClient.post(`/admin/gyms/${id}/locations`, input),
    onSuccess: () => {
      invalidate();
      setLocationForm({ name: "", address: "", equipment: "" });
      setShowLocationForm(false);
    },
  });

  const commercialMutation = useMutation({
    mutationFn: (input: UpdateGymCommercialInput) => apiClient.patch(`/admin/gyms/${id}/commercial`, input),
    onSuccess: () => {
      invalidate();
      setCommercialForm(null);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => apiClient.patch(`/admin/gyms/${id}/status`, { status: "approved" }),
    onSuccess: invalidate,
  });

  const suspendMutation = useMutation({
    mutationFn: (reason: string) => apiClient.patch(`/admin/gyms/${id}/status`, { status: "suspended", note: reason }),
    onSuccess: invalidate,
  });

  const draft = commercialForm ?? (data ? { commissionPct: data.gym.commissionPct, pricingModel: data.gym.pricingModel, ratePerMemberCents: data.gym.ratePerMemberCents } : null);
  const isLocationFormValid = locationForm.name.trim().length > 0 && locationForm.address.trim().length > 0;

  return (
    <AppShell title="Gym Profile">
      {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

      {isError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {extractErrorMessage(error, "Couldn't load this gym.")}
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
                <h2 className="text-lg font-semibold">{data.gym.name}</h2>
                <StatusBadge status={data.gym.status} />
              </div>
              <div className="mt-1 text-sm text-text-secondary">
                {data.gym.contactName} · {data.gym.contactEmail}
              </div>
              {data.gym.contactPhone && <div className="text-xs text-text-dim">{data.gym.contactPhone}</div>}
              <div className="mt-2 text-xs text-text-dim">
                Invite code: <span className="font-mono">{data.gym.inviteCode}</span>
              </div>
            </div>
            <Link to="/gyms" className="text-xs text-text-secondary hover:text-text-primary">
              ← Back to Directory
            </Link>
          </div>

          {/* Status transitions — approve (plain button, normal onboarding path)
              and suspend (ReasonGatedAction, high-impact/destructive), matching
              STATUS_TRANSITIONS in gyms.service.ts exactly (application/suspended
              -> approved; approved -> suspended). */}
          <div className="flex flex-wrap gap-4">
            {data.gym.status !== "approved" && (
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-text-dim">Approve Partner</div>
                <p className="mt-1 text-xs text-text-secondary">
                  Moves this gym from {data.gym.status} to Approved — the normal partner-onboarding path.
                </p>
                <button
                  type="button"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                  className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                >
                  {approveMutation.isPending ? "Approving…" : "Approve"}
                </button>
                {approveMutation.isError && (
                  <p className="mt-2 text-xs text-danger">{extractErrorMessage(approveMutation.error, "Couldn't approve this gym.")}</p>
                )}
              </div>
            )}

            {data.gym.status === "approved" && (
              <div className="flex-1">
                <ReasonGatedAction
                  title="Suspend Partner"
                  description="Suspends this gym partner — reversible later by approving again. Requires a real reason on record."
                  actionLabel={suspendMutation.isPending ? "Suspending…" : "Suspend"}
                  isPending={suspendMutation.isPending}
                  isError={suspendMutation.isError}
                  error={suspendMutation.error}
                  onConfirm={(reason) => suspendMutation.mutate(reason)}
                  tone="danger"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Commercial terms */}
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">Commercial Terms</div>
              {draft && (
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <div className="text-[11px] text-text-dim">Commission %</div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.commissionPct}
                      onChange={(e) =>
                        setCommercialForm({ ...draft, commissionPct: Number(e.target.value) || 0 })
                      }
                      className="mt-1 w-full rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <div className="text-[11px] text-text-dim">Pricing model</div>
                    <input
                      type="text"
                      value={draft.pricingModel}
                      onChange={(e) => setCommercialForm({ ...draft, pricingModel: e.target.value })}
                      className="mt-1 w-full rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <div className="text-[11px] text-text-dim">
                      Rate per member (cents)
                      {!data.gym.ratePerMemberConfigured && (
                        <span className="ml-1.5 rounded bg-surface-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warning">
                          Not configured
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={draft.ratePerMemberCents}
                      onChange={(e) =>
                        setCommercialForm({ ...draft, ratePerMemberCents: Number(e.target.value) || 0 })
                      }
                      className="mt-1 w-full rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                    />
                    <p className="mt-1 text-[11px] text-text-dim">
                      0 means this gym's per-member rate has never been set — a real placeholder, not a free rate.
                    </p>
                  </label>
                  <button
                    type="button"
                    disabled={commercialMutation.isPending}
                    onClick={() => commercialMutation.mutate(draft)}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                  >
                    {commercialMutation.isPending ? "Saving…" : "Save Commercial Terms"}
                  </button>
                  {commercialMutation.isError && (
                    <p className="text-xs text-danger">
                      {extractErrorMessage(commercialMutation.error, "Couldn't update commercial terms.")}
                    </p>
                  )}
                  {commercialMutation.isSuccess && !commercialMutation.isPending && (
                    <p className="text-xs text-accent">Commercial terms updated.</p>
                  )}
                </div>
              )}
            </div>

            {/* Member activation summary — real, honest aggregate; see
                getMemberActivationSummary()'s own doc comment for why it's
                always zero today (User.gymId resolution is later-wave work). */}
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">Member Activation Summary</div>
              {isSummaryLoading && <p className="mt-3 text-sm text-text-secondary">Loading…</p>}
              {summary && (
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Members" value={summary.memberCount} />
                  <Row label="Onboarding completed" value={summary.onboardingCompletedCount} />
                  <Row label="First workout completed" value={summary.firstWorkoutCompletedCount} />
                </dl>
              )}
              <p className="mt-3 text-[11px] text-text-dim">
                Aggregate counts only — never a member list or any per-member data (BR-GYM-003). Will read zero for
                every gym until `acquisitionContext.ts`'s gym-code capture is resolved into `User.gymId` (deliberately
                deferred, not this wave's scope).
              </p>
            </div>
          </div>

          {/* Locations */}
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-text-dim">Locations ({data.gym.locations.length})</div>
              <button
                type="button"
                onClick={() => setShowLocationForm((v) => !v)}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
              >
                {showLocationForm ? "Cancel" : "Add Location"}
              </button>
            </div>

            {showLocationForm && (
              <div className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-border-subtle bg-surface-raised p-3 sm:grid-cols-2">
                <label className="block">
                  <div className="text-[11px] text-text-dim">Location name</div>
                  <input
                    type="text"
                    value={locationForm.name}
                    onChange={(e) => setLocationForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <div className="text-[11px] text-text-dim">Address</div>
                  <input
                    type="text"
                    value={locationForm.address}
                    onChange={(e) => setLocationForm((f) => ({ ...f, address: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <div className="text-[11px] text-text-dim">Equipment (optional)</div>
                  <textarea
                    value={locationForm.equipment ?? ""}
                    onChange={(e) => setLocationForm((f) => ({ ...f, equipment: e.target.value }))}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    disabled={!isLocationFormValid || addLocationMutation.isPending}
                    onClick={() => addLocationMutation.mutate(locationForm)}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                  >
                    {addLocationMutation.isPending ? "Adding…" : "Add Location"}
                  </button>
                  {addLocationMutation.isError && (
                    <p className="mt-2 text-xs text-danger">
                      {extractErrorMessage(addLocationMutation.error, "Couldn't add that location.")}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {data.gym.locations.map((l) => (
                <div key={l.id} className="rounded-md border border-border-subtle p-3">
                  <div className="font-medium text-text-primary">{l.name}</div>
                  <div className="text-xs text-text-secondary">{l.address}</div>
                  {l.equipment && <div className="mt-1 text-xs text-text-dim">{l.equipment}</div>}
                </div>
              ))}
              {data.gym.locations.length === 0 && <p className="text-sm text-text-dim">No locations added yet.</p>}
            </div>
          </div>
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
