import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { GYMS_SUB_NAV } from "./subNav";

interface GymHelpRequest {
  id: string;
  category: string;
  subject: string;
  body: string;
  gymReference: string | null;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  gym: { id: string; name: string; contactName: string; contactEmail: string };
  location: { id: string; name: string } | null;
  resolvedByAdmin: { fullName: string } | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  trainer_support: "Trainer support",
  equipment: "Equipment",
  member_onboarding: "Member onboarding",
  billing: "Billing",
  other: "Other",
};

/**
 * The staff side of the gym portal's trainer-help requests.
 *
 * DESIGN-PENDING — not in the handoff's own A-M list, because the
 * requests themselves did not exist when it was written. Built alongside
 * the gym-facing form rather than after it: a request form with no queue
 * behind it collects a promise nobody can keep.
 *
 * The reply is written FOR the gym and shown to them verbatim, unlike the
 * staff-facing `reason` on refunds and privacy requests. That difference
 * is worth keeping in mind while typing.
 */
export function GymHelpRequestsScreen() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const requests = useQuery({
    queryKey: ["gymHelpRequestsAdmin", status],
    queryFn: async () =>
      (await apiClient.get<GymHelpRequest[]>("/admin/gym-help-requests", { params: { status } })).data,
  });

  const respond = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "in_progress" | "resolved" }) =>
      apiClient.post(`/admin/gym-help-requests/${id}/respond`, {
        status: next,
        resolutionNote: drafts[id] ?? "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gymHelpRequestsAdmin"] });
      queryClient.invalidateQueries({ queryKey: ["adminActionItems"] });
    },
  });

  const rows = requests.data ?? [];

  return (
    <AppShell title="Gym Help Requests" subNav={GYMS_SUB_NAV}>
      <p className="mb-5 max-w-3xl text-sm text-text-secondary">
        Operational requests from gym partners. Your reply is shown to the gym word for word. We can't discuss an
        individual member's training, food or health with a partner, however the question is phrased.
      </p>

      <div className="mb-5 flex items-center gap-3">
        <label className="text-xs text-text-dim" htmlFor="help-status">
          Status
        </label>
        <select
          id="help-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        >
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {respond.isError ? (
        <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {extractErrorMessage(respond.error, "Couldn't send your reply.")}
        </p>
      ) : null}

      {requests.isLoading ? (
        <p className="text-sm text-text-dim">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-dim">Nothing in this state.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <article key={r.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{r.subject}</h2>
                  <p className="text-xs text-text-dim">
                    {r.gym.name}
                    {r.location ? ` · ${r.location.name}` : ""} · {CATEGORY_LABEL[r.category] ?? r.category} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-text-dim">
                    {r.gym.contactName} · {r.gym.contactEmail}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm text-text-secondary">{r.body}</p>
              {r.gymReference ? (
                <p className="mt-2 text-xs text-text-dim">
                  Their own reference: “{r.gymReference}” — the gym wrote this, it isn't a member we resolved.
                </p>
              ) : null}

              {r.resolutionNote ? (
                <div className="mt-3 rounded-md bg-accent/10 px-3 py-2">
                  <p className="text-xs font-medium text-accent">
                    Replied{r.resolvedByAdmin ? ` by ${r.resolvedByAdmin.fullName}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{r.resolutionNote}</p>
                </div>
              ) : null}

              {r.status !== "resolved" ? (
                <div className="mt-4">
                  <label className="block text-xs text-text-dim" htmlFor={`reply-${r.id}`}>
                    Your reply to the gym
                  </label>
                  <textarea
                    id={`reply-${r.id}`}
                    rows={3}
                    value={drafts[r.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    className="mt-1 w-full max-w-2xl rounded-md border border-border bg-canvas px-3 py-2 text-sm text-text-primary"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={respond.isPending || (drafts[r.id] ?? "").trim().length < 5}
                      onClick={() => respond.mutate({ id: r.id, next: "resolved" })}
                      className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40"
                    >
                      Reply & resolve
                    </button>
                    <button
                      type="button"
                      disabled={respond.isPending || (drafts[r.id] ?? "").trim().length < 5}
                      onClick={() => respond.mutate({ id: r.id, next: "in_progress" })}
                      className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
                    >
                      Reply, keep open
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
