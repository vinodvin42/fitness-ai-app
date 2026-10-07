import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { apiClient } from "../lib/api";

interface HelpRequest {
  id: string;
  memberFirstName: string;
  memberNumber: string;
  topic: "form_check" | "machine_help" | "trainer_available" | "other";
  exerciseName: string | null;
  workoutName: string | null;
  note: string | null;
  status: "open" | "seen" | "resolved";
  createdAt: string;
  respondedAt: string | null;
}

const TOPIC: Record<HelpRequest["topic"], string> = {
  form_check: "Form check",
  machine_help: "Help with a machine",
  trainer_available: "Trainer available now?",
  other: "Something else",
};
const FILTERS = ["open", "seen", "resolved"] as const;

/**
 * Help requests from members, showing only what the member chose to send: first
 * name, member number, topic, exercise/workout name and note. No health data,
 * food logs, photos or AI chats ever reach this inbox.
 */
export function HelpRequestsScreen() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("open");
  const key = ["gym-portal-help-requests", status];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => apiClient.get<{ items: HelpRequest[] }>("/gym-portal/help-requests", { params: { status } }).then((r) => r.data.items),
    refetchInterval: 30_000,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; status: "seen" | "resolved" }) => apiClient.patch(`/gym-portal/help-requests/${v.id}`, { status: v.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gym-portal-help-requests"] }),
  });

  return (
    <AppShell title="Help requests">
      <div className="max-w-2xl space-y-4">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatus(f)}
              className={`rounded-full px-3 py-1 text-xs capitalize ${status === f ? "bg-accent/15 font-medium text-accent" : "text-text-secondary hover:bg-surface-raised"}`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface">
          {isLoading && <p className="p-4 text-sm text-text-secondary">Loading…</p>}
          {data?.length === 0 && <p className="p-4 text-sm text-text-secondary">No {status} requests.</p>}
          {data?.map((r) => (
            <div key={r.id} className="space-y-1 border-b border-border-subtle px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">
                  {r.memberFirstName} <span className="font-mono text-xs text-text-dim">{r.memberNumber}</span>
                </div>
                <div className="text-[11px] text-text-dim">{new Date(r.createdAt).toLocaleString()}</div>
              </div>
              <div className="text-sm text-text-secondary">
                {TOPIC[r.topic]}
                {r.exerciseName ? ` · ${r.exerciseName}` : ""}
                {r.workoutName ? ` (${r.workoutName})` : ""}
              </div>
              {r.note && <div className="rounded-md bg-canvas px-3 py-2 text-xs text-text-secondary">{r.note}</div>}
              {r.status !== "resolved" && (
                <div className="flex gap-3 pt-1">
                  {r.status === "open" && (
                    <button type="button" onClick={() => update.mutate({ id: r.id, status: "seen" })} className="text-xs text-accent hover:underline">
                      Mark seen
                    </button>
                  )}
                  <button type="button" onClick={() => update.mutate({ id: r.id, status: "resolved" })} className="text-xs text-accent hover:underline">
                    Mark resolved
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
