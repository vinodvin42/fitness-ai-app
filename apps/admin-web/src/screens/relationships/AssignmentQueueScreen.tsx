import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { RELATIONSHIPS_SUB_NAV } from "./subNav";

interface GuidanceRequestRow {
  id: string;
  serviceType: "fitness" | "nutrition";
  status: string;
  userNote: string | null;
  rematchCount: number;
  closedReason: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string };
}

interface AvailableProfessional {
  id: string;
  fullName: string;
  serviceTypes?: string[];
  activeClients?: number;
  maxActiveClients?: number;
}

async function fetchQueue(status: string): Promise<GuidanceRequestRow[]> {
  const res = await apiClient.get<GuidanceRequestRow[]>("/admin/guidance-requests", { params: { status } });
  return res.data;
}

async function fetchAvailable(): Promise<AvailableProfessional[]> {
  const res = await apiClient.get<{ professionals?: AvailableProfessional[] } | AvailableProfessional[]>(
    "/admin/professional-offers/available-professionals",
  );
  return Array.isArray(res.data) ? res.data : res.data.professionals ?? [];
}

/**
 * A-M1 — "Professional assignment queue: open user requests -> match ->
 * send offer".
 *
 * The handoff lists this as missing with the note "Nothing creates offers
 * today (flow F5)". That was only half true of this codebase: the API
 * to create an offer already existed and was tested, but there was no
 * record of a user *asking* for guidance for an admin to act on, and no
 * screen to act on it from. The backend half now exists
 * (GuidanceRequest + POST /admin/guidance-requests/:id/match); this is
 * the screen.
 *
 * DESIGN-PENDING A-M1 — no Figma exists for this screen. Built from the
 * console's existing directory/queue patterns (filters row, table, inline
 * action) per the handoff's instruction to build a plain version rather
 * than skip it.
 *
 * Deliberately shows no prices and no ratings next to a professional:
 * decision #4 rules out per-session prices and ratings entirely, and a
 * match here is a capacity-and-service decision, not a purchase.
 */
export function AssignmentQueueScreen() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("open");
  const [selected, setSelected] = useState<Record<string, string>>({});

  const queue = useQuery({ queryKey: ["guidanceQueue", status], queryFn: () => fetchQueue(status) });
  const professionals = useQuery({ queryKey: ["availableProfessionals"], queryFn: fetchAvailable });

  const match = useMutation({
    mutationFn: ({ requestId, professionalId }: { requestId: string; professionalId: string }) =>
      apiClient.post(`/admin/guidance-requests/${requestId}/match`, { professionalId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guidanceQueue"] });
      queryClient.invalidateQueries({ queryKey: ["adminActionItems"] });
    },
  });

  const rows = queue.data ?? [];
  const pros = professionals.data ?? [];

  return (
    <AppShell title="Professional Assignment" subNav={RELATIONSHIPS_SUB_NAV}>
      <div className="mb-4 flex items-center gap-3">
        <label className="text-xs text-text-dim" htmlFor="assignment-status">
          Status
        </label>
        <select
          id="assignment-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        >
          <option value="open">Open</option>
          <option value="offered">Offer sent</option>
          <option value="exhausted">No match found</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {match.isError ? (
        <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {extractErrorMessage(match.error, "Could not send the offer.")}
        </p>
      ) : null}

      {queue.isLoading ? (
        <p className="text-sm text-text-dim">Loading…</p>
      ) : queue.isError ? (
        <p className="text-sm text-danger">{extractErrorMessage(queue.error, "Could not load the queue.")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-dim">
          {status === "open"
            ? "No unmatched requests. Every user asking for guidance has an offer out or a professional assigned."
            : "Nothing in this state."}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Service</th>
              <th className="py-2 pr-4">Asked</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Match</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 align-top">
                <td className="py-3 pr-4">
                  <div className="text-text-primary">{r.user.fullName}</div>
                  <div className="text-xs text-text-dim">{r.user.email}</div>
                  {r.userNote ? <div className="mt-1 max-w-sm text-xs text-text-dim">“{r.userNote}”</div> : null}
                </td>
                <td className="py-3 pr-4 capitalize text-text-primary">{r.serviceType}</td>
                <td className="py-3 pr-4 text-xs text-text-dim">
                  {new Date(r.createdAt).toLocaleDateString()}
                  {/* D11's re-match count, shown only once it matters. */}
                  {r.rematchCount > 0 ? (
                    <div className="mt-1 text-warning">
                      {r.rematchCount} declined/expired
                    </div>
                  ) : null}
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={r.status} />
                  {r.closedReason ? <div className="mt-1 text-xs text-text-dim">{r.closedReason}</div> : null}
                </td>
                <td className="py-3 pr-4">
                  {r.status === "open" || r.status === "exhausted" ? (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Professional for ${r.user.fullName}`}
                        value={selected[r.id] ?? ""}
                        onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.value }))}
                        className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary"
                      >
                        <option value="">Select a professional…</option>
                        {pros.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.fullName}
                            {p.maxActiveClients != null && p.activeClients != null
                              ? ` — ${p.activeClients}/${p.maxActiveClients} clients`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selected[r.id] || match.isPending}
                        onClick={() => match.mutate({ requestId: r.id, professionalId: selected[r.id] })}
                        className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-black disabled:opacity-40"
                      >
                        Send offer
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-text-dim">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}
