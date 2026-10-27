import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminContentReviewListResponse, ContentReviewContentType, ContentReviewStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { useCan } from "../../lib/permissions";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { PROGRAMS_SUB_NAV } from "./subNav";

const CONTENT_TYPE_LABELS: Record<ContentReviewContentType, string> = {
  program: "Program",
  exercise: "Exercise",
  recipe: "Recipe",
  article: "Article",
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
 * Recipes — and, since Oct 2026, Educational Content (05.04) articles,
 * which can ONLY be published from here: approving one needs the name and
 * credentials of the expert who checked it (shown to members as "Reviewed
 * by …"). "Priority"
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
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<ContentReviewStatus | "">("pending");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  // Articles (05.04): the expert who checked it, required to approve.
  const [expert, setExpert] = useState<Record<string, { name: string; credentials: string }>>({});
  const expertFor = (id: string) => expert[id] ?? { name: "", credentials: "" };
  const queryClient = useQueryClient();
  // Hide what this role can't do (the API still checks every call).
  const canApprove = useCan("programs", "approve");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-content-reviews", statusFilter],
    queryFn: () => fetchQueue(statusFilter),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-content-reviews"] });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/admin/content-reviews/${id}/approve`, {
        reviewNotes: reviewNotes[id],
        ...(expert[id]?.name.trim() ? { expertReviewerName: expert[id].name.trim(), expertReviewerCredentials: expert[id].credentials.trim() } : {}),
      }),
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/content-reviews/${id}/reject`, { reviewNotes: reviewNotes[id] }),
    onSuccess: invalidate,
  });

  return (
    <AppShell title={t("reviewQueue.reviewApproval")} subNav={PROGRAMS_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t("reviewQueue.pending")} value={data.counts.pending} />
            <StatCard label={t("reviewQueue.approved")} value={data.counts.approved} />
            <StatCard label={t("reviewQueue.rejected")} value={data.counts.rejected} />
          </div>
        )}

        <div className="rounded-xl border border-border-subtle bg-surface shadow-xs/50 p-4 text-xs text-text-secondary">
          A content creator can submit a draft Program, Exercise, Recipe or Article here for a second admin to sign off on.
          Approving publishes it (the same effect as the direct Publish button on its own Directory screen); rejecting
          leaves it as a draft with your notes attached. You can't approve or reject something you submitted yourself.
          Articles have no direct Publish button: approving one needs the expert who checked it.
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("reviewQueue.status")}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ContentReviewStatus | "")}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="pending">{t("reviewQueue.pending")}</option>
              <option value="approved">{t("reviewQueue.approved")}</option>
              <option value="rejected">{t("reviewQueue.rejected")}</option>
              <option value="">{t("reviewQueue.all")}</option>
            </select>
          </label>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">{t("reviewQueue.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load the queue.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("reviewQueue.retry")}
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
            <div key={r.id} className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{r.contentName ?? "(deleted)"}</div>
                  <div className="text-xs text-text-dim">
                    {CONTENT_TYPE_LABELS[r.contentType]}
                    {r.contentType === "article" && (
                      <>
                        {" · "}
                        <Link to={`/programs/education?id=${r.contentId}`} className="text-accent hover:underline">
                          Read the article
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-text-dim">{t("reviewQueue.author")}</dt>
                  <dd className="text-text-secondary">{r.submittedByName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">{t("reviewQueue.date")}</dt>
                  <dd className="text-text-secondary">{new Date(r.createdAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">{t("reviewQueue.reviewer")}</dt>
                  <dd className="text-text-secondary">{r.reviewedByName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">{t("reviewQueue.reviewed")}</dt>
                  <dd className="text-text-secondary">{r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString() : "—"}</dd>
                </div>
              </dl>

              {canApprove && r.status === "pending" ? (
                <div className="mt-3">
                  <textarea
                    placeholder={t("reviewQueue.reviewNotesOptional")}
                    value={reviewNotes[r.id] ?? ""}
                    onChange={(e) => setReviewNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    className="w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                    rows={2}
                  />
                  {r.contentType === "article" && (
                    <fieldset className="mt-2 grid gap-2 sm:grid-cols-2">
                      <legend className="mb-1 text-xs text-text-dim">
                        Expert who checked this article (required to approve; members see "Reviewed by …")
                      </legend>
                      <label className="flex flex-col gap-1 text-xs text-text-dim">
                        Name
                        <input
                          value={expertFor(r.id).name}
                          onChange={(e) => setExpert((prev) => ({ ...prev, [r.id]: { ...expertFor(r.id), name: e.target.value } }))}
                          placeholder="e.g. their full name"
                          className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-text-dim">
                        Credentials
                        <input
                          value={expertFor(r.id).credentials}
                          onChange={(e) => setExpert((prev) => ({ ...prev, [r.id]: { ...expertFor(r.id), credentials: e.target.value } }))}
                          placeholder="e.g. Registered Dietitian"
                          className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                        />
                      </label>
                    </fieldset>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={
                        approveMutation.isPending ||
                        rejectMutation.isPending ||
                        (r.contentType === "article" &&
                          (expertFor(r.id).name.trim().length < 2 || expertFor(r.id).credentials.trim().length < 2))
                      }
                      onClick={() => approveMutation.mutate(r.id)}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                    >
                      {t("reviewQueue.approvePublish")}
                    </button>
                    <button
                      type="button"
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate(r.id)}
                      className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger disabled:opacity-40"
                    >
                      {t("reviewQueue.reject")}
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
                    <span className="text-text-dim">{t("reviewQueue.reviewNotes")}</span>
                    {r.reviewNotes}
                  </p>
                )
              )}
            </div>
          ))}

        {data && (
          <NotAvailablePanel
            keys={data.notAvailable}
            subtitle={t("reviewQueue.noBackingFieldExists")}
          />
        )}
      </div>
    </AppShell>
  );
}
