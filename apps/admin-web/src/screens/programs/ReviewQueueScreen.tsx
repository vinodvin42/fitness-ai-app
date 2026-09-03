import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminContentReviewListResponse, ContentReviewContentType, ContentReviewStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { PROGRAMS_SUB_NAV } from "./subNav";

const CONTENT_TYPE_LABELS: Record<ContentReviewContentType, string> = {
  program: "Program",
  exercise: "Exercise",
  recipe: "Recipe",
};

async function fetchQueue(status: ContentReviewStatus | ""): Promise<AdminContentReviewListResponse> {
  const res = await apiClient.get<AdminContentReviewListResponse>("/admin/content-reviews", {
    params: { status: status || undefined },
  });
  return res.data;
}

/**
 * 05.05 Review / Approval (docs/admin/03-screen-inventory.md §05.05) —
 * added 25 Aug 2026, joining Programs/Exercises/Recipes (05.01–05.03) as
 * the fourth real screen in Module 05. Covers Programs, Exercises, and
 * Recipes only — Educational Content (05.04) still isn't a real entity
 * anywhere in this build, so it can't be part of a real queue. "Priority"
 * and "SLA" (spec'd columns with no backing field) and the Figma's fourth
 * "In Review" tab (no "claimed by a reviewer" state is modeled) are
 * surfaced as honest gaps rather than faked — see adminPrograms.service.ts
 * for the full reasoning.
 *
 * Submitting a draft for review is a new action on each of the three
 * Directory screens ("Submit for Review", next to Edit/Publish) — it does
 * NOT block the existing direct Publish button there; this queue is an
 * additional, optional path, not a mandatory gate.
 *
 * **What Approve/Reject actually do:** Approve publishes the underlying
 * content (reuses the exact same publishProgram/publishExercise/
 * publishRecipe functions the direct Publish button calls). Reject leaves
 * the content untouched (still draft) and just records the reviewer's
 * notes. Both require a different admin than whoever submitted it — see
 * adminPrograms.service.ts's `cannot_approve_own_content_review` guard.
 */
export function ReviewQueueScreen() {
  const [statusFilter, setStatusFilter] = useState<ContentReviewStatus | "">("pending");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-content-reviews", statusFilter],
    queryFn: () => fetchQueue(statusFilter),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-content-reviews"] });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/content-reviews/${id}/approve`, { reviewNotes: reviewNotes[id] }),
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/content-reviews/${id}/reject`, { reviewNotes: reviewNotes[id] }),
    onSuccess: invalidate,
  });

  return (
    <AppShell title="Review / Approval" subNav={PROGRAMS_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Pending" value={data.counts.pending} />
            <StatCard label="Approved" value={data.counts.approved} />
            <StatCard label="Rejected" value={data.counts.rejected} />
          </div>
        )}

        <div className="rounded-lg border border-border-subtle bg-surface/50 p-4 text-xs text-text-secondary">
          A content creator can submit a draft Program, Exercise, or Recipe here for a second admin to sign off on.
          Approving publishes it (the same effect as the direct Publish button on its own Directory screen); rejecting
          leaves it as a draft with your notes attached. You can't approve or reject something you submitted yourself.
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ContentReviewStatus | "")}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
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

        {data && data.reviews.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-subtle bg-surface/50 p-8 text-center text-sm text-text-dim">
            No {statusFilter || ""} review requests.
          </div>
        )}

        {data &&
          data.reviews.map((r) => (
            <div key={r.id} className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{r.contentName ?? "(deleted)"}</div>
                  <div className="text-xs text-text-dim">{CONTENT_TYPE_LABELS[r.contentType]}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-text-dim">Author</dt>
                  <dd className="text-text-secondary">{r.submittedByName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Date</dt>
                  <dd className="text-text-secondary">{new Date(r.createdAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Reviewer</dt>
                  <dd className="text-text-secondary">{r.reviewedByName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Reviewed</dt>
                  <dd className="text-text-secondary">{r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString() : "—"}</dd>
                </div>
              </dl>

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
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      onClick={() => approveMutation.mutate(r.id)}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                    >
                      Approve (publish)
                    </button>
                    <button
                      type="button"
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate(r.id)}
                      className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                  {(approveMutation.isError || rejectMutation.isError) && (
                    <p className="mt-2 text-xs text-danger">
                      {extractErrorMessage(approveMutation.error ?? rejectMutation.error, "That action didn't go through.")}
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
            subtitle="No backing field exists yet for these Figma-spec'd columns — see adminPrograms.service.ts."
          />
        )}
      </div>
    </AppShell>
  );
}
