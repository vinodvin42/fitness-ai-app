import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type {
  AdminRelationshipDetailResponse,
  AdminRelationshipHandoverResponse,
  AvailableProfessionalsResponse,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { ReasonGatedAction } from "../../components/ReasonGatedAction";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { RELATIONSHIPS_SUB_NAV } from "./subNav";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

const ACTION_LABELS: Record<string, string> = {
  "admin.relationship.ended": "Relationship ended (by admin)",
  "admin.relationship.reactivated": "Relationship reactivated",
  // Wave 3 (20 Sep 2026) — the real professional-initiated counterpart,
  // apps/coach-mobile's own End Relationship action. Same AuditLog
  // entityType/entityId as the admin-initiated action above (unfiltered
  // by actor — see adminRelationships.service.ts's getRelationshipDetail),
  // so a coach ending this relationship shows up here too, labeled as such.
  "professional.relationship.ended": "Relationship ended (by professional)",
  "relationship.handover": "Handover — replacement professional proposed",
};

type Tab = "overview" | "history";

async function fetchDetail(id: string): Promise<AdminRelationshipDetailResponse> {
  const res = await apiClient.get<AdminRelationshipDetailResponse>(`/admin/relationships/${id}`);
  return res.data;
}

function PartyCard({ label, name, email }: { label: string; name: string; email: string }) {
  return (
    <div className="flex-1 rounded-lg border border-border-subtle bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-text-dim">{label}</div>
      <div className="mt-1 text-base font-semibold text-text-primary">{name}</div>
      <div className="text-sm text-text-secondary">{email}</div>
    </div>
  );
}

/**
 * 04.02 Relationship Detail (docs/admin/03-screen-inventory.md §04) — added
 * 21 Aug 2026. The "visual connection block" is a two-card User↔Professional
 * layout with the module's own nav glyph (⇄) between them. Overview and
 * History are both real, but History is deliberately NOT the Figma's
 * session/payment history (no `Booking` entity exists for that) — it's the
 * `AuditLog` trail of admin actions taken on this relationship, labeled as
 * such so it isn't mistaken for a real session log. See
 * apps/api's adminRelationships.service.ts for the full real-vs-not
 * breakdown.
 *
 * **25 Aug 2026:** 04.03's Change/Intervention Queue is real now (its own
 * screen, linked via `RELATIONSHIPS_SUB_NAV`) — reviewing a specific
 * change request there can end THIS relationship as its real effect, same
 * as the "End Relationship" button below.
 *
 * **Wave 3 (20 Sep 2026, R1 U6):** "End Relationship" is now a real
 * `ReasonGatedAction` (required reason, recorded to the audit trail) —
 * previously an optional plain textarea, the one high-impact action in
 * this module that predated BR-ADM-005's reason-gating discipline (see
 * ReasonGatedAction.tsx's own doc comment). A real "Handover to Another
 * Coach" action is new below it — the reassignment picker this screen's
 * own comment used to say didn't exist anywhere: ends this pairing and, if
 * a replacement is picked, creates a real `ProfessionalOffer` for them via
 * the same admin-web "available professionals" list Propose Professional
 * (UserProfileScreen.tsx) already established. See apps/api's
 * relationshipLifecycle.service.ts for why this composes the existing
 * endRelationship + createOffer rather than a second transfer model.
 */
export function RelationshipDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [handoverProfessionalId, setHandoverProfessionalId] = useState("");
  const [handoverSearch, setHandoverSearch] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-relationship-detail", id],
    queryFn: () => fetchDetail(id as string),
    enabled: !!id,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-relationship-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-relationships"] });
  };

  const endMutation = useMutation({
    mutationFn: (reason: string) => apiClient.post(`/admin/relationships/${id}/end`, { reason }),
    onSuccess: invalidateAll,
  });

  const handoverMutation = useMutation({
    mutationFn: (reason: string) =>
      apiClient.post<AdminRelationshipHandoverResponse>(`/admin/relationships/${id}/handover`, {
        reason,
        replacementProfessionalId: handoverProfessionalId || undefined,
      }),
    onSuccess: () => {
      setHandoverProfessionalId("");
      invalidateAll();
    },
  });

  // Reuses the exact same "available for new clients" read Propose
  // Professional (UserProfileScreen.tsx) already established — see this
  // screen's own top comment.
  const availableProfessionalsQuery = useQuery({
    queryKey: ["admin-available-professionals", handoverSearch],
    queryFn: async () => {
      const res = await apiClient.get<AvailableProfessionalsResponse>("/admin/professional-offers/available-professionals", {
        params: handoverSearch ? { search: handoverSearch } : undefined,
      });
      return res.data;
    },
    enabled: tab === "overview" && data?.relationship.status === "active",
  });

  const reactivateMutation = useMutation({
    mutationFn: () => apiClient.post(`/admin/relationships/${id}/reactivate`),
    onSuccess: invalidateAll,
  });

  const relationship = data?.relationship;

  return (
    <AppShell title="Relationship Detail" subNav={RELATIONSHIPS_SUB_NAV}>
      {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

      {isError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {extractErrorMessage(error, "Couldn't load this relationship.")}
          <button type="button" onClick={() => refetch()} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {data && relationship && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-1 items-center gap-3">
              <PartyCard label="User" name={relationship.userFullName} email={relationship.userEmail} />
              <span className="text-2xl text-text-dim">⇄</span>
              <PartyCard label="Professional" name={relationship.professionalFullName} email={relationship.professionalEmail} />
            </div>
            <Link to="/relationships" className="ml-4 text-xs text-text-secondary hover:text-text-primary">
              ← Back to Directory
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["overview", "history"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md border px-3 py-1.5 text-xs capitalize transition-colors ${
                  tab === t
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border-subtle text-text-secondary hover:text-text-primary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-text-dim">Pairing</div>
                  <StatusBadge status={relationship.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-text-dim">Service</dt>
                    <dd className="text-text-secondary">{SERVICE_LABELS[relationship.serviceType] ?? relationship.serviceType}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-dim">Started</dt>
                    <dd className="text-text-secondary">{new Date(relationship.createdAt).toLocaleDateString()}</dd>
                  </div>
                  {relationship.endedAt && (
                    <div>
                      <dt className="text-xs text-text-dim">Ended</dt>
                      <dd className="text-text-secondary">{new Date(relationship.endedAt).toLocaleDateString()}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <NotAvailablePanel
                keys={data.notAvailable}
                subtitle="No backing field exists yet for these Figma-spec'd Overview fields — see adminRelationships.service.ts."
              />

              {relationship.status === "active" ? (
                <>
                  <ReasonGatedAction
                    title="End Relationship"
                    description="Ends this pairing — reversible via Reactivate below while it's still shown here. The user finds a new professional themselves via Discovery (there's no reassignment picker on this action — for that, use Handover below instead). A reason is required and recorded to the audit trail."
                    actionLabel="End Relationship"
                    isPending={endMutation.isPending}
                    isError={endMutation.isError}
                    error={endMutation.error}
                    onConfirm={(reason) => endMutation.mutate(reason)}
                  />

                  {/*
                    Wave 3 (20 Sep 2026, R1 U6) — the real "Handover to
                    Another Coach" action: End Relationship above, plus an
                    optional real ProfessionalOffer for a named replacement
                    in the same action. Reuses the exact same "available for
                    new clients" professional picker Propose Professional
                    (UserProfileScreen.tsx) already established, and the
                    same ReasonGatedAction reason discipline as End
                    Relationship above — the picker sits above it since
                    ReasonGatedAction owns its own reason state internally.
                  */}
                  <div className="rounded-lg border border-border-subtle bg-surface p-4">
                    <div className="text-xs uppercase tracking-wide text-text-dim">Handover to Another Coach</div>
                    <p className="mt-1 text-xs text-text-secondary">
                      Ends this pairing and, if you pick a replacement below, creates a real offer for them targeting
                      the same client/service — the coach still has to accept it before a new Relationship exists.
                      Leaving no replacement selected below is the same as End Relationship above.
                    </p>

                    <div className="mt-3">
                      <label className="text-[11px] text-text-dim">Replacement professional (optional)</label>
                      <input
                        type="text"
                        placeholder="Search by name…"
                        value={handoverSearch}
                        onChange={(e) => setHandoverSearch(e.target.value)}
                        className="mt-1 w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                      />
                      <select
                        value={handoverProfessionalId}
                        onChange={(e) => setHandoverProfessionalId(e.target.value)}
                        className="mt-1 w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                      >
                        <option value="">
                          {availableProfessionalsQuery.isLoading ? "Loading…" : "No replacement — just end the relationship"}
                        </option>
                        {availableProfessionalsQuery.data?.professionals
                          .filter((p) => p.id !== relationship.professionalId)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.fullName}
                              {p.yearsExperience != null ? ` · ${p.yearsExperience}y exp` : ""}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="mt-3">
                      <ReasonGatedAction
                        title="Confirm Handover"
                        description="A reason is required and recorded to the audit trail."
                        actionLabel={handoverProfessionalId ? "Hand Over" : "End Relationship"}
                        tone="warning"
                        isPending={handoverMutation.isPending}
                        isError={handoverMutation.isError}
                        error={handoverMutation.error}
                        onConfirm={(reason) => handoverMutation.mutate(reason)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-border-subtle bg-surface p-4">
                  <div className="text-sm font-medium">Reactivate Relationship</div>
                  <p className="mt-1 text-xs text-text-secondary">Reopens this pairing as active.</p>
                  <button
                    type="button"
                    disabled={reactivateMutation.isPending}
                    onClick={() => reactivateMutation.mutate()}
                    className="mt-3 rounded-md border border-accent px-3 py-1.5 text-xs text-accent disabled:opacity-40"
                  >
                    Reactivate
                  </button>
                  {reactivateMutation.isError && (
                    <p className="mt-2 text-xs text-danger">
                      {extractErrorMessage(reactivateMutation.error, "That action didn't go through.")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="rounded-lg border border-border-subtle bg-surface">
              <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
                Admin action history — not a session/payment log, see this screen's own doc comment
              </div>
              <ul className="divide-y divide-border-subtle">
                {data.history.map((h) => (
                  <li key={h.id} className="px-4 py-3">
                    <div className="text-sm text-text-primary">{ACTION_LABELS[h.action] ?? h.action}</div>
                    <div className="text-xs text-text-dim">{new Date(h.createdAt).toLocaleString()}</div>
                    {h.metadata?.reason != null && h.metadata.reason !== "" && (
                      <div className="mt-1 text-xs text-text-secondary">Reason: {String(h.metadata.reason)}</div>
                    )}
                  </li>
                ))}
                {data.history.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-text-dim">No admin actions recorded yet.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
