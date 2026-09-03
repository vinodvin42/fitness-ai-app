import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminEscalationListResponse, EscalationStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { SUPPORT_SUB_NAV } from "./subNav";

async function fetchEscalations(status: EscalationStatus | ""): Promise<AdminEscalationListResponse> {
  const res = await apiClient.get<AdminEscalationListResponse>("/admin/escalations", {
    params: { status: status || undefined },
  });
  return res.data;
}

/**
 * 08.02 Escalations (docs/admin/03-screen-inventory.md §08.02) — added
 * 25 Aug 2026, joining Support Tickets as Module 08's second real screen.
 * An escalation is a workflow annotation on a `SupportTicket` — raised
 * from that ticket's detail panel (see SupportTicketsScreen.tsx's
 * "Escalate" action, next to the existing Triage panel) — not a new
 * intake of its own. Unlike 08.03 Complaints / 08.04 Safety-Abuse
 * Reports (still genuinely unbuilt — see adminSupport.service.ts's doc
 * comment), this stayed a small enough gap to close for real: one guard
 * (at most one open escalation per ticket), one action (Resolve — no
 * self-resolution restriction, since resolving your own escalation isn't
 * the review-your-own-work conflict `ContentReview`'s guard exists for),
 * no "reopen" (a ticket that flares up again gets a fresh `Escalation`
 * row, so the queue stays an honest per-incident history).
 */
export function EscalationsScreen() {
  const [statusFilter, setStatusFilter] = useState<EscalationStatus | "">("open");
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-escalations", statusFilter],
    queryFn: () => fetchEscalations(statusFilter),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/admin/escalations/${id}/resolve`, { resolutionNotes: resolutionNotes[id] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-escalations"] }),
  });

  return (
    <AppShell title="Escalations" subNav={SUPPORT_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total" value={data.counts.total} />
            <StatCard label="Open" value={data.counts.open} />
            <StatCard label="Resolved" value={data.counts.resolved} />
          </div>
        )}

        <div className="rounded-lg border border-border-subtle bg-surface/50 p-4 text-xs text-text-secondary">
          Tickets that first-line support flagged as needing more attention. Escalating doesn't change the
          underlying ticket's own Status/Priority — triage that separately from its detail panel — this is just a
          record of who raised it, why, and when it was handled. Complaints and Safety/Abuse Reports (08.03/08.04)
          aren't part of this queue — neither has a filing flow anywhere in this build yet.
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as EscalationStatus | "")}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="">All</option>
            </select>
          </label>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load escalations.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && data.escalations.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-subtle bg-surface/50 p-8 text-center text-sm text-text-dim">
            No {statusFilter || ""} escalations.
          </div>
        )}

        {data &&
          data.escalations.map((e) => (
            <div key={e.id} className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{e.ticketSubject}</div>
                  <div className="text-xs text-text-dim">
                    {e.ticketUserFullName} ({e.ticketUserEmail}) · ticket <StatusBadge status={e.ticketStatus} />
                  </div>
                </div>
                <StatusBadge status={e.status} />
              </div>

              <p className="mt-3 text-sm text-text-secondary">
                <span className="text-xs text-text-dim">Reason: </span>
                {e.reason}
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-text-dim">Escalated by</dt>
                  <dd className="text-text-secondary">{e.escalatedByName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Date</dt>
                  <dd className="text-text-secondary">{new Date(e.createdAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Resolved by</dt>
                  <dd className="text-text-secondary">{e.resolvedByName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Resolved</dt>
                  <dd className="text-text-secondary">
                    {e.resolvedAt ? new Date(e.resolvedAt).toLocaleDateString() : "—"}
                  </dd>
                </div>
              </dl>

              {e.status === "open" ? (
                <div className="mt-3">
                  <textarea
                    placeholder="Resolution notes (optional)"
                    value={resolutionNotes[e.id] ?? ""}
                    onChange={(ev) => setResolutionNotes((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                    className="w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                    rows={2}
                  />
                  <button
                    type="button"
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate(e.id)}
                    className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                  >
                    Resolve
                  </button>
                  {resolveMutation.isError && (
                    <p className="mt-2 text-xs text-danger">
                      {extractErrorMessage(resolveMutation.error, "That action didn't go through.")}
                    </p>
                  )}
                </div>
              ) : (
                e.resolutionNotes && (
                  <p className="mt-3 text-xs text-text-secondary">
                    <span className="text-text-dim">Resolution notes: </span>
                    {e.resolutionNotes}
                  </p>
                )
              )}
            </div>
          ))}
      </div>
    </AppShell>
  );
}
