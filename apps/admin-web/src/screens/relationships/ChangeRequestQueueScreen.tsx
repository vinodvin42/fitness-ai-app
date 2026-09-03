import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AdminChangeRequestDirectoryResponse, ChangeReasonCategory, RelationshipChangeStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { RELATIONSHIPS_SUB_NAV } from "./subNav";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };
const REASON_LABELS: Record<ChangeReasonCategory, string> = {
  schedule_conflict: "Schedule conflict",
  different_specialization: "Wants a different specialization",
  other: "Other",
};

async function fetchQueue(status: RelationshipChangeStatus | ""): Promise<AdminChangeRequestDirectoryResponse> {
  const res = await apiClient.get<AdminChangeRequestDirectoryResponse>("/admin/relationships/change-requests", {
    params: { status: status || undefined },
  });
  return res.data;
}

/**
 * 04.03 Change/Intervention Queue (docs/admin/03-screen-inventory.md §04)
 * — added 25 Aug 2026, the last of Module 04's three spec'd screens.
 * User/Current Professional/Reason/Submitted/Status are all real, backed
 * by `RelationshipChangeRequest` (created by apps/user-mobile's Change
 * Professional screen). The Figma's "Requested (new professional)" column
 * has no backing field — surfaced via `NotAvailablePanel` rather than
 * faked, see apps/api's adminRelationships.service.ts for why.
 *
 * The Figma's "policy note box" (a static explainer of the intervention
 * rule set) is written directly below, once, rather than modeled as data
 * — it's UI copy, not a config screen manages.
 *
 * **What Approve/Deny actually do:** see adminRelationships.service.ts's
 * top comment. Approve ends the flagged relationship (the one real,
 * well-defined effect this schema supports, since no field captures which
 * replacement professional a user wanted) — Deny leaves it untouched.
 * Both are one-way: a reviewed request can't be re-reviewed from here.
 */
export function ChangeRequestQueueScreen() {
  const [statusFilter, setStatusFilter] = useState<RelationshipChangeStatus | "">("pending");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-change-requests", statusFilter],
    queryFn: () => fetchQueue(statusFilter),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-change-requests"] });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/relationships/change-requests/${id}/approve`, { reviewNotes: reviewNotes[id] }),
    onSuccess: invalidate,
  });

  const denyMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/relationships/change-requests/${id}/deny`, { reviewNotes: reviewNotes[id] }),
    onSuccess: invalidate,
  });

  return (
    <AppShell title="Change / Intervention Queue" subNav={RELATIONSHIPS_SUB_NAV}>
      <div className="space-y-4">
        <div className="rounded-lg border border-border-subtle bg-surface/50 p-4 text-xs text-text-secondary">
          A user asking to change professionals doesn't end their current pairing automatically — it stays active
          until a request here is approved. Approving ends the flagged relationship; the user then finds a new
          professional themselves through Discovery. Denying leaves everything as it is.
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RelationshipChangeStatus | "")}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Denied</option>
              <option value="">All</option>
            </select>
          </label>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load the queue.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && data.requests.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-subtle bg-surface/50 p-8 text-center text-sm text-text-dim">
            No {statusFilter || ""} change requests.
          </div>
        )}

        {data &&
          data.requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{r.userFullName}</div>
                  <div className="text-xs text-text-dim">{r.userEmail}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-text-dim">Current Professional</dt>
                  <dd className="text-text-secondary">
                    <Link to={`/relationships/${r.relationshipId}`} className="text-accent hover:underline">
                      {r.currentProfessionalFullName}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Service</dt>
                  <dd className="text-text-secondary">{SERVICE_LABELS[r.serviceType] ?? r.serviceType}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Reason</dt>
                  <dd className="text-text-secondary">{REASON_LABELS[r.reason] ?? r.reason}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Submitted</dt>
                  <dd className="text-text-secondary">{new Date(r.createdAt).toLocaleDateString()}</dd>
                </div>
              </dl>

              {r.note && (
                <p className="mt-3 rounded-md bg-surface-raised p-2 text-xs text-text-secondary">
                  <span className="text-text-dim">Note from user: </span>
                  {r.note}
                </p>
              )}

              {r.status === "pending" ? (
                <div className="mt-3">
                  <textarea
                    placeholder="Review notes (optional)"
                    value={reviewNotes[r.id] ?? ""}
                    onChange={(e) => setReviewNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    className="w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                    rows={2}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={approveMutation.isPending || denyMutation.isPending}
                      onClick={() => approveMutation.mutate(r.id)}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                    >
                      Approve (end pairing)
                    </button>
                    <button
                      type="button"
                      disabled={approveMutation.isPending || denyMutation.isPending}
                      onClick={() => denyMutation.mutate(r.id)}
                      className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger disabled:opacity-40"
                    >
                      Deny
                    </button>
                  </div>
                  {(approveMutation.isError || denyMutation.isError) && (
                    <p className="mt-2 text-xs text-danger">
                      {extractErrorMessage(approveMutation.error ?? denyMutation.error, "That action didn't go through.")}
                    </p>
                  )}
                </div>
              ) : (
                r.reviewNotes && (
                  <p className="mt-3 text-xs text-text-secondary">
                    <span className="text-text-dim">Review notes: </span>
                    {r.reviewNotes}
                  </p>
                )
              )}
            </div>
          ))}

        {data && (
          <NotAvailablePanel
            keys={data.notAvailable}
            subtitle="No backing field exists yet for this Figma-spec'd column — see adminRelationships.service.ts."
          />
        )}
      </div>
    </AppShell>
  );
}
