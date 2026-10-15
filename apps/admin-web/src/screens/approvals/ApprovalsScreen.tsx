import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApprovalRequest, ApprovalStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { useAuth } from "../../lib/auth";

interface ApprovalsResponse {
  approvals: ApprovalRequest[];
  counts: Partial<Record<ApprovalStatus, number>>;
}

const TABS: Array<{ label: string; status: ApprovalStatus | "" }> = [
  { label: "Waiting", status: "pending" },
  { label: "Approved", status: "approved" },
  { label: "Rejected", status: "rejected" },
  { label: "Changes asked", status: "changes_requested" },
  { label: "Expired", status: "expired" },
  { label: "Failed", status: "failed" },
  { label: "All", status: "" },
];

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  applying: "bg-warning/15 text-warning",
  approved: "bg-info/15 text-info",
  rejected: "bg-danger/15 text-danger",
  changes_requested: "bg-accent/15 text-accent",
  expired: "bg-surface-raised text-text-dim",
  failed: "bg-danger/15 text-danger",
  cancelled: "bg-surface-raised text-text-dim",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting",
  applying: "Applying",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes asked",
  expired: "Expired",
  failed: "Failed",
  cancelled: "Withdrawn",
};

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function resultMessage(body: unknown): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" ? message : "";
}

function Pill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status] ?? ""}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/**
 * Approvals inbox (FynroX blueprint section 5, decision D21). Changes by
 * the co-founder and the other admins wait here; nothing goes live until
 * Lakshman (Super Admin) approves. Approving re-runs the original change as
 * the person who asked for it, and the audit log records both of them.
 */
export function ApprovalsScreen() {
  const queryClient = useQueryClient();
  const { adminUser } = useAuth();
  const isSuperAdmin = adminUser?.role === "super_admin";
  const [status, setStatus] = useState<ApprovalStatus | "">("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  // Shown once after approving (e.g. a new admin's temporary password); never stored.
  const [lastApplied, setLastApplied] = useState<unknown>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-approvals", status],
    queryFn: async () =>
      (await apiClient.get<ApprovalsResponse>("/admin/approvals", { params: { status: status || undefined } })).data,
  });

  const selected = data?.approvals.find((a) => a.id === selectedId) ?? null;

  const decide = useMutation({
    mutationFn: async (action: "approve" | "reject" | "request-changes" | "cancel") =>
      apiClient.post(`/admin/approvals/${selectedId}/${action}`, note.trim() ? { note: note.trim() } : {}),
    onSuccess: (res) => {
      setLastApplied((res.data as { appliedResult?: unknown }).appliedResult ?? null);
      setNote("");
      setActionError(null);
      setSelectedId(null);
      queryClient.invalidateQueries();
    },
    onError: (err) => setActionError(extractErrorMessage(err, "Couldn't save the decision.")),
  });

  return (
    <AppShell title="Approvals">
      <p className="mb-4 text-sm text-text-secondary">
        {isSuperAdmin
          ? "Changes waiting for you. Nothing goes live until you approve. You can't approve your own change, and requests expire if nobody decides."
          : "Changes you sent to Lakshman. Nothing goes live until he approves."}
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => {
              setStatus(tab.status);
              setSelectedId(null);
            }}
            className={`rounded-full px-3 py-1 text-xs ${
              status === tab.status ? "bg-accent/15 font-medium text-accent" : "bg-surface-raised text-text-secondary"
            }`}
          >
            {tab.label}
            {tab.status && data?.counts?.[tab.status] ? ` · ${data.counts[tab.status]}` : ""}
          </button>
        ))}
      </div>

      {lastApplied != null && (
        <div className="mb-4 rounded-xl border border-border-subtle bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">Change applied. Result (shown once, not saved):</p>
            <button type="button" onClick={() => setLastApplied(null)} className="text-xs text-accent hover:underline">
              Close
            </button>
          </div>
          <pre className="max-h-56 overflow-auto rounded-md bg-surface-raised p-2 text-[11px] text-text-primary">
            {JSON.stringify(lastApplied, null, 2)}
          </pre>
        </div>
      )}

      {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
      {isError && <p className="text-sm text-danger">{extractErrorMessage(error, "Couldn't load approvals.")}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle text-left text-xs text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Change</th>
                <th className="px-4 py-3 font-medium">Asked by</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody>
              {data?.approvals.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-secondary">
                    Nothing here.
                  </td>
                </tr>
              )}
              {data?.approvals.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => {
                    setSelectedId(a.id);
                    setActionError(null);
                  }}
                  className={`cursor-pointer border-b border-border-subtle last:border-0 hover:bg-surface-raised ${
                    a.id === selectedId ? "bg-surface-raised" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-text-primary">{a.summary}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{a.reason}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {a.maker.fullName ?? a.maker.email ?? "—"}
                    <div className="text-xs text-text-dim">{a.makerRole.replace(/_/g, " ")}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Pill status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{a.status === "pending" ? when(a.expiresAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="rounded-xl border border-border-subtle bg-surface p-4">
          {!selected ? (
            <p className="text-sm text-text-secondary">Select a request to see what it changes.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-text-primary">{selected.summary}</span>
                <Pill status={selected.status} />
              </div>
              <dl className="space-y-1 text-xs">
                <div>
                  <dt className="inline text-text-secondary">Asked by: </dt>
                  <dd className="inline text-text-primary">{selected.maker.fullName ?? selected.maker.email}</dd>
                </div>
                <div>
                  <dt className="inline text-text-secondary">Asked on: </dt>
                  <dd className="inline text-text-primary">{when(selected.createdAt)}</dd>
                </div>
                {selected.checker && (
                  <div>
                    <dt className="inline text-text-secondary">Decided by: </dt>
                    <dd className="inline text-text-primary">
                      {selected.checker.fullName ?? selected.checker.email} · {when(selected.decidedAt)}
                    </dd>
                  </div>
                )}
              </dl>
              <div>
                <p className="mb-1 text-xs text-text-secondary">Reason</p>
                <p className="rounded-md bg-surface-raised p-2 text-text-primary">{selected.reason}</p>
              </div>
              <div>
                <p className="mb-1 text-xs text-text-secondary">What changes</p>
                <pre className="max-h-56 overflow-auto rounded-md bg-surface-raised p-2 text-[11px] text-text-primary">
                  {JSON.stringify(selected.body, null, 2)}
                </pre>
              </div>
              {selected.decisionNote && (
                <div>
                  <p className="mb-1 text-xs text-text-secondary">Note</p>
                  <p className="text-text-primary">{selected.decisionNote}</p>
                </div>
              )}
              {selected.status === "failed" && (
                <p className="text-xs text-danger">
                  Approved, but the change could not be applied (status {selected.resultStatus}).{" "}
                  {resultMessage(selected.resultBody)}
                </p>
              )}

              {selected.status === "pending" && (
                <div className="space-y-2 border-t border-border-subtle pt-3">
                  {isSuperAdmin && (
                    <>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Note (optional for approve, needed to ask for changes)"
                        className="h-20 w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate("reject")}
                          className="flex-1 rounded-md border border-border-subtle py-2 text-xs text-text-primary disabled:opacity-60"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={decide.isPending || note.trim().length < 3}
                          onClick={() => decide.mutate("request-changes")}
                          className="flex-1 rounded-md border border-border-subtle py-2 text-xs text-text-primary disabled:opacity-60"
                        >
                          Ask for changes
                        </button>
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate("approve")}
                          className="flex-1 rounded-md bg-accent py-2 text-xs font-medium text-canvas disabled:opacity-60"
                        >
                          Approve
                        </button>
                      </div>
                      <p className="text-[11px] text-text-dim">Approving applies the change now · saved to the audit log with who asked and who approved.</p>
                    </>
                  )}
                  {!isSuperAdmin && selected.maker.id === adminUser?.id && (
                    <button
                      type="button"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate("cancel")}
                      className="w-full rounded-md border border-border-subtle py-2 text-xs text-text-primary disabled:opacity-60"
                    >
                      Withdraw request
                    </button>
                  )}
                  {actionError && <p className="text-xs text-danger">{actionError}</p>}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
