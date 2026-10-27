import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCoachPricingResponse, ProfessionalServiceType } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { useCan } from "../../lib/permissions";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { COMMERCE_SUB_NAV } from "./subNav";

/**
 * Coach levels and fees (blueprint 4.3, Package 4). FynroX places each
 * coach in a level and sets a fee per level per service; coaches can't
 * change either. Fees are before GST. FynroX's commission is a default
 * rate with optional per-coach rates.
 *
 * Every change has a start date (blank = now) and a reason, and reaches
 * new bookings only — bookings already made keep their fee and commission.
 * Anyone but the Super Admin sends the change for approval.
 */

const INPUT =
  "rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent";
const BUTTON = "rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-50";
const LINK = "text-xs text-accent hover:underline";
const MIN_REASON = 10;

function money(cents: number): string {
  return `₹${(cents / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Today's date in India (YYYY-MM-DD) — the earliest start date the API accepts. */
function todayIndia(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function typeLabel(t: ProfessionalServiceType | null): string {
  return t === "fitness" ? "Fitness" : t === "nutrition" ? "Nutrition" : "Fitness + nutrition";
}

async function fetchPricing(): Promise<AdminCoachPricingResponse> {
  return (await apiClient.get<AdminCoachPricingResponse>("/admin/coach-levels")).data;
}

type Panel =
  | { kind: "fee"; levelId: string; serviceId: string; price: string; effectiveFrom: string; reason: string }
  | { kind: "defaultCommission"; pct: string; effectiveFrom: string; reason: string }
  | { kind: "coachCommission"; professionalId: string; pct: string; effectiveFrom: string; reason: string }
  | { kind: "coachLevel"; professionalId: string; coachLevelId: string; reason: string }
  | { kind: "newLevel"; name: string; description: string }
  | { kind: "renameLevel"; levelId: string; name: string; description: string }
  | { kind: "newService"; label: string; serviceType: ProfessionalServiceType | "combined"; duration: string }
  | null;

export function CoachLevelsScreen() {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>(null);
  // Hide what this role can't do (the API still checks every call).
  const canCreate = useCan("commerce", "create");
  const canEdit = useCan("commerce", "edit");
  const canPlaceCoach = useCan("professionals", "edit");
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["admin-coach-levels"], queryFn: fetchPricing });

  const save = useMutation({
    mutationFn: async (p: NonNullable<Panel>) => {
      switch (p.kind) {
        case "fee":
          return apiClient.post(`/admin/coach-levels/${p.levelId}/fees`, {
            serviceId: p.serviceId,
            priceCents: Math.round(Number(p.price || "0") * 100),
            effectiveFrom: p.effectiveFrom || undefined,
            reason: p.reason,
          });
        case "defaultCommission":
          return apiClient.post("/admin/commission-rates/default", {
            pct: Number(p.pct),
            effectiveFrom: p.effectiveFrom || undefined,
            reason: p.reason,
          });
        case "coachCommission":
          return apiClient.post(`/admin/professionals/${p.professionalId}/commission`, {
            pct: p.pct === "" ? null : Number(p.pct),
            effectiveFrom: p.effectiveFrom || undefined,
            reason: p.reason,
          });
        case "coachLevel":
          return apiClient.put(`/admin/professionals/${p.professionalId}/coach-level`, {
            coachLevelId: p.coachLevelId || null,
            reason: p.reason,
          });
        case "newLevel":
          return apiClient.post("/admin/coach-levels", { name: p.name, description: p.description || undefined });
        case "renameLevel":
          return apiClient.patch(`/admin/coach-levels/${p.levelId}`, { name: p.name, description: p.description || null });
        case "newService":
          return apiClient.post("/admin/coach-services", {
            label: p.label,
            serviceType: p.serviceType === "combined" ? null : p.serviceType,
            durationMinutes: Number(p.duration),
          });
      }
    },
    onSuccess: () => {
      setPanel(null);
      queryClient.invalidateQueries({ queryKey: ["admin-coach-levels"] });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ["admin-approvals"] }),
  });

  const action = useMutation({
    mutationFn: (req: { method: "post" | "patch"; url: string; body?: unknown }) =>
      req.method === "post" ? apiClient.post(req.url, req.body ?? {}) : apiClient.patch(req.url, req.body ?? {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-coach-levels"] }),
  });

  function open(p: Panel) {
    save.reset();
    setPanel(p);
  }

  const reasonOk = (r: string) => r.trim().length >= MIN_REASON;

  return (
    <AppShell title="Coach levels & fees" subNav={COMMERCE_SUB_NAV}>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {isError && <p className="text-sm text-danger">{extractErrorMessage(error, "Couldn't load coach levels.")}</p>}
        {action.error && <p className="text-sm text-danger">{extractErrorMessage(action.error, "That didn't work.")}</p>}

        {data && (
          <>
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="FynroX commission" value={`${data.commission.defaultPct}%`} />
              <StatCard label="GST on coach fees" value={`${data.gstPercent}%`} />
              <StatCard label="Levels" value={data.levels.filter((l) => l.isActive).length} />
              <StatCard label="Coaches without a level" value={data.coaches.filter((c) => !c.coachLevelId).length} />
            </div>

            <p className="text-xs text-text-dim">
              Fees are before GST. Every change has a start date and only reaches new bookings — bookings already made
              keep their fee and commission. Coaches can't change their level or fees.
            </p>

            {/* ---- Panel (one form at a time) ---- */}
            {panel && (
              <div className="space-y-3 rounded-lg border border-accent bg-surface p-4">
                {panel.kind === "fee" && (
                  <>
                    <p className="text-sm font-medium text-text-primary">
                      New fee: {data.levels.find((l) => l.id === panel.levelId)?.name} ·{" "}
                      {data.services.find((s) => s.id === panel.serviceId)?.label}
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1 text-xs text-text-dim">
                        Fee before GST (₹, 0 = free session)
                        <input className={INPUT} type="number" min={0} step="1" value={panel.price}
                          onChange={(e) => setPanel({ ...panel, price: e.target.value })} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-text-dim">
                        Starts (blank = now)
                        <input className={INPUT} type="date" min={todayIndia()} value={panel.effectiveFrom}
                          onChange={(e) => setPanel({ ...panel, effectiveFrom: e.target.value })} />
                      </label>
                    </div>
                  </>
                )}
                {panel.kind === "defaultCommission" && (
                  <>
                    <p className="text-sm font-medium text-text-primary">FynroX default commission</p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1 text-xs text-text-dim">
                        Commission %
                        <input className={INPUT} type="number" min={0} max={100} value={panel.pct}
                          onChange={(e) => setPanel({ ...panel, pct: e.target.value })} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-text-dim">
                        Starts (blank = now)
                        <input className={INPUT} type="date" min={todayIndia()} value={panel.effectiveFrom}
                          onChange={(e) => setPanel({ ...panel, effectiveFrom: e.target.value })} />
                      </label>
                    </div>
                  </>
                )}
                {panel.kind === "coachCommission" && (
                  <>
                    <p className="text-sm font-medium text-text-primary">
                      Commission for {data.coaches.find((c) => c.id === panel.professionalId)?.fullName}
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1 text-xs text-text-dim">
                        Commission % (blank = use the default)
                        <input className={INPUT} type="number" min={0} max={100} value={panel.pct}
                          onChange={(e) => setPanel({ ...panel, pct: e.target.value })} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-text-dim">
                        Starts (blank = now)
                        <input className={INPUT} type="date" min={todayIndia()} value={panel.effectiveFrom}
                          onChange={(e) => setPanel({ ...panel, effectiveFrom: e.target.value })} />
                      </label>
                    </div>
                  </>
                )}
                {panel.kind === "coachLevel" && (
                  <>
                    <p className="text-sm font-medium text-text-primary">
                      Level for {data.coaches.find((c) => c.id === panel.professionalId)?.fullName}
                    </p>
                    <select className={INPUT} value={panel.coachLevelId}
                      onChange={(e) => setPanel({ ...panel, coachLevelId: e.target.value })}>
                      <option value="">No level (can't be booked)</option>
                      {data.levels.filter((l) => l.isActive).map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </>
                )}
                {panel.kind === "newLevel" || panel.kind === "renameLevel" ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-xs text-text-dim">
                      Level name
                      <input className={INPUT} value={panel.name} onChange={(e) => setPanel({ ...panel, name: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-dim">
                      Description
                      <input className={INPUT} value={panel.description}
                        onChange={(e) => setPanel({ ...panel, description: e.target.value })} />
                    </label>
                  </div>
                ) : null}
                {panel.kind === "newService" && (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-xs text-text-dim">
                      Service name
                      <input className={INPUT} value={panel.label} onChange={(e) => setPanel({ ...panel, label: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-dim">
                      Type
                      <select className={INPUT} value={panel.serviceType}
                        onChange={(e) => setPanel({ ...panel, serviceType: e.target.value as ProfessionalServiceType | "combined" })}>
                        <option value="fitness">Fitness</option>
                        <option value="nutrition">Nutrition</option>
                        <option value="combined">Fitness + nutrition</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-dim">
                      Minutes
                      <input className={INPUT} type="number" min={10} max={240} value={panel.duration}
                        onChange={(e) => setPanel({ ...panel, duration: e.target.value })} />
                    </label>
                  </div>
                )}
                {"reason" in panel && (
                  <label className="flex flex-col gap-1 text-xs text-text-dim">
                    Reason (saved to the audit log; at least {MIN_REASON} characters)
                    <input className={`${INPUT} w-full`} value={panel.reason}
                      onChange={(e) => setPanel({ ...panel, reason: e.target.value } as Panel)} />
                  </label>
                )}
                {save.error && <p className="text-xs text-danger">{extractErrorMessage(save.error, "Couldn't save.")}</p>}
                <div className="flex gap-2">
                  <button type="button" className={BUTTON}
                    disabled={
                      save.isPending ||
                      ("reason" in panel && !reasonOk(panel.reason)) ||
                      // A blank fee is not "free": type 0 for a free session.
                      (panel.kind === "fee" && panel.price.trim() === "") ||
                      (panel.kind === "defaultCommission" && panel.pct.trim() === "")
                    }
                    onClick={() => save.mutate(panel)}>
                    {save.isPending ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="text-xs text-text-secondary" onClick={() => setPanel(null)}>Cancel</button>
                </div>
              </div>
            )}

            {/* ---- Fees: levels × services ---- */}
            <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs text-text-dim">
                    <th className="px-4 py-3 font-normal">Level</th>
                    {data.services.filter((s) => s.isActive).map((s) => (
                      <th key={s.id} className="px-4 py-3 font-normal">
                        {s.label}
                        <span className="block text-[11px]">{typeLabel(s.serviceType)} · {s.durationMinutes} min</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.levels.map((l) => (
                    <tr key={l.id} className={`border-b border-border-subtle last:border-0 ${l.isActive ? "" : "opacity-50"}`}>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-text-primary">{l.name}</p>
                        <p className="text-xs text-text-dim">{l.description ?? ""} · {l.coachCount} coach{l.coachCount === 1 ? "" : "es"}</p>
                        {canEdit && (
                          <div className="mt-1 flex gap-2">
                            <button type="button" className={LINK}
                              onClick={() => open({ kind: "renameLevel", levelId: l.id, name: l.name, description: l.description ?? "" })}>
                              Rename
                            </button>
                            <button type="button" className={LINK}
                              onClick={() => action.mutate({ method: "patch", url: `/admin/coach-levels/${l.id}`, body: { isActive: !l.isActive } })}>
                              {l.isActive ? "Switch off" : "Switch on"}
                            </button>
                          </div>
                        )}
                      </td>
                      {data.services.filter((s) => s.isActive).map((s) => {
                        const fee = l.fees.find((f) => f.serviceId === s.id);
                        return (
                          <td key={s.id} className="px-4 py-3 align-top">
                            <p className="text-text-primary">{fee?.priceCents != null ? money(fee.priceCents) : "Not set"}</p>
                            {fee?.scheduled.map((sc) => (
                              <p key={sc.id} className="text-xs text-text-dim">
                                → {money(sc.priceCents)} from {dateText(sc.effectiveFrom)}{" "}
                                {canEdit && (
                                  <button type="button" className={LINK}
                                    onClick={() => action.mutate({ method: "post", url: `/admin/coach-fees/${sc.id}/cancel` })}>
                                    cancel
                                  </button>
                                )}
                              </p>
                            ))}
                            {canEdit && (
                              <button type="button" className={LINK}
                                onClick={() => open({ kind: "fee", levelId: l.id, serviceId: s.id, price: fee?.priceCents != null ? String(fee.priceCents / 100) : "", effectiveFrom: "", reason: "" })}>
                                Change fee
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(canCreate || canEdit) && (
              <div className="flex flex-wrap gap-3">
                {canCreate && (
                  <>
                    <button type="button" className={BUTTON} onClick={() => open({ kind: "newLevel", name: "", description: "" })}>
                      + Add level
                    </button>
                    <button type="button" className={BUTTON}
                      onClick={() => open({ kind: "newService", label: "", serviceType: "fitness", duration: "45" })}>
                      + Add service
                    </button>
                  </>
                )}
                {canEdit && data.services.filter((s) => !s.isActive).map((s) => (
                  <button key={s.id} type="button" className={LINK}
                    onClick={() => action.mutate({ method: "patch", url: `/admin/coach-services/${s.id}`, body: { isActive: true } })}>
                    Switch on “{s.label}”
                  </button>
                ))}
              </div>
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-3 text-xs text-text-dim">
                {data.services.filter((s) => s.isActive).map((s) => (
                  <button key={s.id} type="button" className={LINK}
                    onClick={() => action.mutate({ method: "patch", url: `/admin/coach-services/${s.id}`, body: { isActive: false } })}>
                    Switch off “{s.label}”
                  </button>
                ))}
              </div>
            )}

            {/* ---- Commission ---- */}
            <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text-primary">FynroX commission on coach fees: {data.commission.defaultPct}%</p>
                {canEdit && (
                  <button type="button" className={LINK}
                    onClick={() => open({ kind: "defaultCommission", pct: String(data.commission.defaultPct), effectiveFrom: "", reason: "" })}>
                    Change
                  </button>
                )}
              </div>
              {data.commission.scheduled.map((r) => (
                <p key={r.id} className="text-xs text-text-dim">
                  → {r.pct}% from {dateText(r.effectiveFrom)}{" "}
                  {canEdit && (
                    <button type="button" className={LINK}
                      onClick={() => action.mutate({ method: "post", url: `/admin/commission-rates/${r.id}/cancel` })}>
                      cancel
                    </button>
                  )}
                </p>
              ))}
            </div>

            {/* ---- Coaches ---- */}
            <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs text-text-dim">
                    <th className="px-4 py-3 font-normal">Coach</th>
                    <th className="px-4 py-3 font-normal">Verified for</th>
                    <th className="px-4 py-3 font-normal">Level</th>
                    <th className="px-4 py-3 font-normal">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coaches.map((c) => (
                    <tr key={c.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-text-primary">{c.fullName}</p>
                        <p className="text-xs text-text-dim">{c.lifecycleStatus} · {c.status}</p>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {c.verifiedServices.length ? c.verifiedServices.map((s) => typeLabel(s)).join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={c.coachLevelId ? "text-text-primary" : "text-danger"}>
                          {data.levels.find((l) => l.id === c.coachLevelId)?.name ?? "Not placed"}
                        </span>{" "}
                        {canPlaceCoach && (
                          <button type="button" className={LINK}
                            onClick={() => open({ kind: "coachLevel", professionalId: c.id, coachLevelId: c.coachLevelId ?? "", reason: "" })}>
                            Change
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-text-primary">{c.commissionPct}%</span>
                        <span className="text-xs text-text-dim"> {c.hasCommissionOverride ? "(own rate)" : "(default)"}</span>{" "}
                        {canEdit && (
                          <button type="button" className={LINK}
                            onClick={() => open({ kind: "coachCommission", professionalId: c.id, pct: c.hasCommissionOverride ? String(c.commissionPct) : "", effectiveFrom: "", reason: "" })}>
                            Change
                          </button>
                        )}
                        {c.scheduledCommission.map((r) => (
                          <p key={r.id} className="text-xs text-text-dim">
                            → {r.pct === null ? "default" : `${r.pct}%`} from {dateText(r.effectiveFrom)}{" "}
                            {canEdit && (
                              <button type="button" className={LINK}
                                onClick={() => action.mutate({ method: "post", url: `/admin/commission-rates/${r.id}/cancel` })}>
                                cancel
                              </button>
                            )}
                          </p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
