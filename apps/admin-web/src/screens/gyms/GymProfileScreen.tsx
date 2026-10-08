import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type {
  AddGymLocationInput,
  AdminGymDetailResponse,
  AdminGymMemberActivationSummary,
  SetGymPortalPasswordResponse,
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
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [locationForm, setLocationForm] = useState<AddGymLocationInput>({ name: "", address: "", equipment: "" });
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [commercialForm, setCommercialForm] = useState<UpdateGymCommercialInput | null>(null);
  const [portalPassword, setPortalPassword] = useState("");
  const [showPortalPasswordForm, setShowPortalPasswordForm] = useState(false);
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

  // Gym Partner Lite portal bootstrap (R2 Wave 5, 21 Sep 2026) — see
  // gyms.service.ts#setGymPortalPassword's own doc comment for why this
  // admin-set action, rather than a self-serve invite link, is the real
  // onboarding mechanism for apps/gym-portal's login this wave. Re-runnable
  // (rotates the password), so it also doubles as "reset portal password"
  // for a locked-out gym partner.
  const portalPasswordMutation = useMutation({
    mutationFn: (password: string) =>
      apiClient.post<SetGymPortalPasswordResponse>(`/admin/gyms/${id}/portal-password`, { password }),
    onSuccess: () => {
      setPortalPassword("");
      setShowPortalPasswordForm(false);
    },
  });

  function onSubmitPortalPassword(e: FormEvent) {
    e.preventDefault();
    if (portalPassword.trim().length < 8) return;
    portalPasswordMutation.mutate(portalPassword);
  }

  const draft = commercialForm ?? (data ? { commissionPct: data.gym.commissionPct, pricingModel: data.gym.pricingModel, ratePerMemberCents: data.gym.ratePerMemberCents } : null);
  const isLocationFormValid = locationForm.name.trim().length > 0 && locationForm.address.trim().length > 0;

  return (
    <AppShell title={t("gymProfile.gymProfile")}>
      {isLoading && <p className="text-sm text-text-secondary">{t("gymProfile.loading")}</p>}

      {isError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {extractErrorMessage(error, "Couldn't load this gym.")}
          <button type="button" onClick={() => refetch()} className="ml-3 underline">
            {t("gymProfile.retry")}
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
                {t("gymProfile.inviteCodeIs", { code: data.gym.inviteCode })}
              </div>
            </div>
            <Link to="/gyms" className="text-xs text-text-secondary hover:text-text-primary">
              {t("gymProfile.backToDirectory")}
            </Link>
          </div>

          {/* Status transitions — approve (plain button, normal onboarding path)
              and suspend (ReasonGatedAction, high-impact/destructive), matching
              STATUS_TRANSITIONS in gyms.service.ts exactly (application/suspended
              -> approved; approved -> suspended). */}
          <div className="flex flex-wrap gap-4">
            {data.gym.status !== "approved" && (
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-text-dim">{t("gymProfile.approvePartner")}</div>
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
                  title={t("gymProfile.suspendPartner")}
                  description={t("gymProfile.suspendsThisGymPartner")}
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
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("gymProfile.commercialTerms")}</div>
              {draft && (
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <div className="text-[11px] text-text-dim">{t("gymProfile.commission")}</div>
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
                    <div className="text-[11px] text-text-dim">{t("gymProfile.pricingModel")}</div>
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
                          {t("gymProfile.notConfigured")}
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
                      {t("gymProfile.n0MeansThisGym")}
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
                    <p className="text-xs text-accent">{t("gymProfile.commercialTermsUpdated")}</p>
                  )}
                </div>
              )}
            </div>

            {/* Member activation summary — real, honest aggregate; see
                getMemberActivationSummary()'s own doc comment for why it's
                always zero today (User.gymId resolution is later-wave work). */}
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("gymProfile.memberActivationSummary")}</div>
              {isSummaryLoading && <p className="mt-3 text-sm text-text-secondary">{t("gymProfile.loading")}</p>}
              {summary && (
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label={t("gymProfile.members")} value={summary.memberCount} />
                  <Row label={t("gymProfile.onboardingCompleted")} value={summary.onboardingCompletedCount} />
                  <Row label={t("gymProfile.firstWorkoutCompleted")} value={summary.firstWorkoutCompletedCount} />
                </dl>
              )}
              <p className="mt-3 text-[11px] text-text-dim">
                Aggregate counts only — never a member list or any per-member data (BR-GYM-003). Will read zero for
                every gym until `acquisitionContext.ts`'s gym-code capture is resolved into `User.gymId` (deliberately
                deferred, not this wave's scope).
              </p>
            </div>
          </div>

          {/* Gym Partner Lite portal access (R2 Wave 5, 21 Sep 2026) — the real
              bootstrap for apps/gym-portal's login. See
              gyms.service.ts#setGymPortalPassword's own doc comment. */}
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("gymProfile.gymPortalAccess")}</div>
              <button
                type="button"
                onClick={() => setShowPortalPasswordForm((v) => !v)}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
              >
                {showPortalPasswordForm ? "Cancel" : "Set Portal Password"}
              </button>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              Sets or resets the password this gym's own point of contact ({data.gym.contactEmail}) uses to sign in
              to the separate Gym Partner portal. A gym has no portal access at all until this is set for the first
              time.
            </p>

            {showPortalPasswordForm && (
              <form onSubmit={onSubmitPortalPassword} className="mt-3 flex flex-wrap items-end gap-3">
                <label className="block">
                  <div className="text-[11px] text-text-dim">{t("gymProfile.newPortalPasswordMin")}</div>
                  <input
                    type="password"
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                    className="mt-1 w-64 rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </label>
                <button
                  type="submit"
                  disabled={portalPasswordMutation.isPending || portalPassword.trim().length < 8}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                >
                  {portalPasswordMutation.isPending ? "Saving…" : "Save Password"}
                </button>
              </form>
            )}
            {portalPasswordMutation.isError && (
              <p className="mt-2 text-xs text-danger">
                {extractErrorMessage(portalPasswordMutation.error, "Couldn't set the portal password.")}
              </p>
            )}
            {portalPasswordMutation.isSuccess && !portalPasswordMutation.isPending && (
              <p className="mt-2 text-xs text-accent">
                {t("gymProfile.portalPasswordSetShare")}
              </p>
            )}
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
                  <div className="text-[11px] text-text-dim">{t("gymProfile.locationName")}</div>
                  <input
                    type="text"
                    value={locationForm.name}
                    onChange={(e) => setLocationForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <div className="text-[11px] text-text-dim">{t("gymProfile.address")}</div>
                  <input
                    type="text"
                    value={locationForm.address}
                    onChange={(e) => setLocationForm((f) => ({ ...f, address: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <div className="text-[11px] text-text-dim">{t("gymProfile.equipmentOptional")}</div>
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
              {data.gym.locations.length === 0 && <p className="text-sm text-text-dim">{t("gymProfile.noLocationsAddedYet")}</p>}
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
