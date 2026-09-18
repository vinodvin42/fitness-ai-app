import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminSafetyEscalationListResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { SUPPORT_SUB_NAV } from "./subNav";

type ReviewedFilter = "false" | "true" | "";

async function fetchSafetyEscalations(reviewed: ReviewedFilter): Promise<AdminSafetyEscalationListResponse> {
  const res = await apiClient.get<AdminSafetyEscalationListResponse>("/admin/safety-escalations", {
    params: { reviewed: reviewed || undefined },
  });
  return res.data;
}

/**
 * BR-SAF-004 Safety Escalations (added 18 Sep 2026) — Module 08 — Support
 * & Safety's real second queue, joining 08.02 Escalations. A row here is
 * created server-side the moment a user's assessment first reports any
 * medical condition or injury (`users.service.ts#upsertOnboardingProfile`
 * — see that function's own comment); this screen is the one place a
 * human admin can actually see that data and mark it reviewed. See
 * apps/api's `adminSafety.service.ts` for the full real-vs-not scope —
 * deliberately no automated risk scoring, no automated messaging to the
 * user, and no access-blocking here: "make sure a real human sees this,"
 * nothing more.
 */
export function SafetyEscalationsScreen() {
  const [reviewedFilter, setReviewedFilter] = useState<ReviewedFilter>("false");
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-safety-escalations", reviewedFilter],
    queryFn: () => fetchSafetyEscalations(reviewedFilter),
  });

  const reviewMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/safety-escalations/${id}/review`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-safety-escalations"] }),
  });

  return (
    <AppShell title="Safety Escalations" subNav={SUPPORT_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total" value={data.counts.total} />
            <StatCard label="Unreviewed" value={data.counts.unreviewed} />
            <StatCard label="Reviewed" value={data.counts.reviewed} />
          </div>
        )}

        <div className="rounded-lg border border-border-subtle bg-surface/50 p-4 text-xs text-text-secondary">
          BR-SAF-004: a real, human-reviewable record that a user reported a medical condition or injury during
          their assessment — captured as a snapshot at that moment, independent of anything the AI plan-generation
          step recommends. No automated action is taken on this data — "Mark Reviewed" is the one real action a
          human admin takes here, confirming they've actually looked at it. This is not medical advice or a
          diagnosis, and reviewing an entry does not message or restrict the user in any way.
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select
              value={reviewedFilter}
              onChange={(e) => setReviewedFilter(e.target.value as ReviewedFilter)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="false">Unreviewed</option>
              <option value="true">Reviewed</option>
              <option value="">All</option>
            </select>
          </label>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load safety escalations.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && data.escalations.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-subtle bg-surface/50 p-8 text-center text-sm text-text-dim">
            No {reviewedFilter === "false" ? "unreviewed" : reviewedFilter === "true" ? "reviewed" : ""} safety
            escalations.
          </div>
        )}

        {data &&
          data.escalations.map((e) => (
            <div
              key={e.id}
              className={`rounded-lg border p-4 ${e.reviewedAt ? "border-border-subtle bg-surface" : "border-danger/40 bg-danger/5"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-primary">{e.userFullName}</div>
                  <div className="text-xs text-text-dim">{e.userEmail}</div>
                </div>
                <span className="text-xs text-text-dim">{new Date(e.createdAt).toLocaleString()}</span>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-text-dim">Medical conditions</dt>
                  <dd className="text-text-secondary">
                    {e.medicalConditions.length > 0 ? e.medicalConditions.join(", ") : "None reported"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">Injuries</dt>
                  <dd className="text-text-secondary">{e.injuries.length > 0 ? e.injuries.join(", ") : "None reported"}</dd>
                </div>
              </dl>

              {e.reviewedAt ? (
                <p className="mt-3 text-xs text-text-secondary">
                  <span className="text-text-dim">Reviewed by </span>
                  {e.reviewedByAdminName ?? "—"}
                  <span className="text-text-dim"> on {new Date(e.reviewedAt).toLocaleString()}</span>
                </p>
              ) : (
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate(e.id)}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                  >
                    Mark Reviewed
                  </button>
                  {reviewMutation.isError && (
                    <p className="mt-2 text-xs text-danger">
                      {extractErrorMessage(reviewMutation.error, "That action didn't go through.")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
      </div>
    </AppShell>
  );
}
