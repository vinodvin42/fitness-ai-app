import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminComplaintDetail,
  AdminComplaintListResponse,
  CloseComplaintInput,
  ComplaintOutcome,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { useCan } from "../../lib/permissions";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { SUPPORT_SUB_NAV } from "./subNav";

const OUTCOME_LABELS: Record<ComplaintOutcome, string> = {
  upheld: "Upheld",
  partly_upheld: "Partly upheld",
  not_upheld: "Not upheld",
};

const OUTCOME_HINTS: Record<ComplaintOutcome, string> = {
  upheld: "The member was right; say what you've done to put it right.",
  partly_upheld: "Some of it was right; say which part and what you've done.",
  not_upheld: "Nothing went wrong on our side; explain why.",
};

const EVENT_LABELS: Record<string, string> = {
  "support_ticket.created": "Complaint received",
  "admin.supportTicket.updated": "Triage updated",
  "complaint.closed": "Complaint closed",
};

const INPUT_CLASS =
  "rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

function DueLabel({ daysLeft, overdue, closedLate, closed }: { daysLeft: number | null; overdue: boolean; closedLate: boolean; closed: boolean }) {
  if (closed) {
    return closedLate ? <span className="text-danger">Closed late</span> : <span className="text-text-dim">Closed on time</span>;
  }
  if (overdue) {
    const days = Math.abs(daysLeft ?? 0);
    return <span className="font-medium text-danger">Overdue{days > 0 ? ` by ${days} d` : ""}</span>;
  }
  if (daysLeft !== null && daysLeft <= 7) return <span className="text-warning">{daysLeft} d left</span>;
  return <span className="text-text-secondary">{daysLeft} d left</span>;
}

/**
 * 08.03 Complaints (docs/admin/03-screen-inventory.md §08.03), Oct 2026 —
 * formal complaints members file from the app's support form (GET/POST
 * /admin/complaints; see the Complaints section of adminSupport.service.ts).
 *
 * India's Consumer Protection (E-Commerce) Rules 2020, rule 4(5): acknowledge
 * within 48 hours (the member sees a reference the moment they submit) and
 * resolve within one month — the "due" date here. Left: the complaints, most
 * urgent first. Right: the dossier — facts, the member's billing (only for
 * roles that can see Commerce), the thread, a reply box, and closing with an
 * outcome and a note the member receives.
 */
export function ComplaintsScreen() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"open" | "closed" | "">("open");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useQuery({
    queryKey: ["admin-complaints", status, search],
    queryFn: () =>
      apiClient
        .get<AdminComplaintListResponse>("/admin/complaints", { params: { status: status || undefined, search: search || undefined } })
        .then((r) => r.data),
  });

  const detail = useQuery({
    queryKey: ["admin-complaint", selectedId],
    queryFn: () => apiClient.get<AdminComplaintDetail>(`/admin/complaints/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-complaints"] });
    queryClient.invalidateQueries({ queryKey: ["admin-complaint", selectedId] });
  };

  return (
    <AppShell title="Complaints" subNav={SUPPORT_SUB_NAV}>
      <div className="space-y-4">
        {list.data && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Open" value={list.data.stats.open} hint={`${list.data.stats.dueWithin7Days} due within 7 days`} />
            <StatCard label="Overdue" value={list.data.stats.overdue} hint="Past the one-month limit" />
            <StatCard
              label="Closed on time (30 days)"
              value={`${list.data.stats.closedOnTimeLast30Days} of ${list.data.stats.closedLast30Days}`}
            />
            <StatCard
              label="Avg days to close (30 days)"
              value={list.data.stats.avgDaysToCloseLast30Days === null ? "—" : list.data.stats.avgDaysToCloseLast30Days}
              hint="Received to closed"
            />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as "open" | "closed" | "")} className={INPUT_CLASS}>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="">All</option>
            </select>
          </label>
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs text-text-dim">
            Search
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Reference (C-…), member, email or subject"
              className={INPUT_CLASS}
            />
          </label>
          <p className="basis-full text-xs text-text-dim">
            Members get a reference the moment they submit, which is the acknowledgement. Each complaint must be resolved within one
            month of receipt.
          </p>
        </div>

        {list.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {list.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(list.error, "Couldn't load complaints.")}
            <button type="button" onClick={() => list.refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {list.data && (
          <div className={`grid gap-4 ${selectedId ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : ""}`}>
            <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
              {list.data.complaints.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-text-dim">
                  {search ? "No complaints match this search." : status === "open" ? "No open complaints." : "No complaints yet."}
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Reference</th>
                      <th scope="col" className="px-4 py-2 font-medium">Member</th>
                      <th scope="col" className="px-4 py-2 font-medium">Received</th>
                      <th scope="col" className="px-4 py-2 font-medium">Due</th>
                      <th scope="col" className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.complaints.map((c) => (
                      <tr
                        key={c.id}
                        className={`border-b border-border-subtle last:border-0 ${selectedId === c.id ? "bg-surface-raised" : "hover:bg-surface-raised"}`}
                      >
                        <td className="px-4 py-2.5 align-top">
                          <button
                            type="button"
                            onClick={() => setSelectedId(c.id)}
                            aria-current={selectedId === c.id ? "true" : undefined}
                            className="text-left"
                          >
                            <span className="font-mono text-xs text-accent hover:underline">{c.reference}</span>
                            <span className="mt-0.5 block max-w-[16rem] truncate text-xs text-text-secondary">{c.subject}</span>
                          </button>
                        </td>
                        <td className="px-4 py-2.5 align-top text-xs text-text-secondary">{c.userFullName}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 align-top text-xs text-text-secondary">{formatDate(c.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 align-top text-xs">
                          <div className="text-text-secondary">{formatDate(c.dueAt)}</div>
                          <DueLabel daysLeft={c.daysLeft} overdue={c.overdue} closedLate={c.closedLate} closed={Boolean(c.closedAt)} />
                        </td>
                        <td className="px-4 py-2.5 align-top text-xs">
                          {c.closedAt ? (
                            <span className="text-text-secondary">{c.outcome ? OUTCOME_LABELS[c.outcome] : "Closed"}</span>
                          ) : (
                            <StatusBadge status={c.status} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {selectedId && (
              <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    aria-label="Close the dossier"
                    className="rounded-md px-2 py-0.5 text-sm text-text-dim hover:bg-surface-raised hover:text-text-primary"
                  >
                    ✕
                  </button>
                </div>
                {detail.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
                {detail.isError && <p className="text-sm text-danger">{extractErrorMessage(detail.error, "Couldn't load this complaint.")}</p>}
                {detail.data && detail.data.id === selectedId && <ComplaintDossier complaint={detail.data} onChanged={refresh} />}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ComplaintDossier({ complaint, onChanged }: { complaint: AdminComplaintDetail; onChanged: () => void }) {
  const [outcome, setOutcome] = useState<ComplaintOutcome | "">("");
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  // Hide what this role can't do (the API still checks every call).
  const canEdit = useCan("support", "edit");
  const closed = Boolean(complaint.closedAt);

  const close = useMutation({
    mutationFn: (input: CloseComplaintInput) => apiClient.post(`/admin/complaints/${complaint.id}/close`, input),
    onSuccess: () => {
      setOutcome("");
      setNote("");
      onChanged();
    },
  });
  const send = useMutation({
    mutationFn: () => apiClient.post(`/admin/support-tickets/${complaint.id}/messages`, { body: reply.trim() }),
    onSuccess: () => {
      setReply("");
      onChanged();
    },
  });

  const canClose = outcome !== "" && note.trim().length >= 10 && !close.isPending;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-accent">{complaint.reference}</span>
          {closed ? (
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-text-secondary">
              Closed: {complaint.outcome ? OUTCOME_LABELS[complaint.outcome] : ""}
            </span>
          ) : complaint.overdue ? (
            <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] text-danger">Overdue</span>
          ) : null}
        </div>
        <h2 className="mt-1 text-sm font-medium text-text-primary">{complaint.subject}</h2>
      </div>

      <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-text-dim">Received</dt>
        <dd className="text-text-secondary">
          {new Date(complaint.createdAt).toLocaleString()}
          <span className="block text-[11px] text-text-dim">Acknowledged at once: the member was shown the reference.</span>
        </dd>
        <dt className="text-text-dim">Resolve by</dt>
        <dd className="text-text-secondary">
          {formatDate(complaint.dueAt)} ·{" "}
          <DueLabel daysLeft={complaint.daysLeft} overdue={complaint.overdue} closedLate={complaint.closedLate} closed={closed} />
        </dd>
        <dt className="text-text-dim">Member</dt>
        <dd className="text-text-secondary">
          <Link to={`/users/${complaint.user.id}`} className="text-accent hover:underline">
            {complaint.user.fullName}
          </Link>{" "}
          <span className="text-text-dim">
            ({complaint.user.email}, {complaint.user.accountStatus})
          </span>
        </dd>
        <dt className="text-text-dim">Member since</dt>
        <dd className="text-text-secondary">{formatDate(complaint.user.memberSince)}</dd>
        <dt className="text-text-dim">Subscription</dt>
        <dd className="text-text-secondary">
          {complaint.billingHidden ? (
            <span className="text-text-dim">Not shown for your role (needs Commerce access)</span>
          ) : complaint.billing?.subscription ? (
            <>
              {complaint.billing.subscription.planName} · {complaint.billing.subscription.status}
              {complaint.billing.subscription.priceCents != null && ` · ${money(complaint.billing.subscription.priceCents, "INR")}`}
              {complaint.billing.subscription.renewsAt &&
                ` · ${complaint.billing.subscription.cancelAtPeriodEnd ? "ends" : "renews"} ${formatDate(complaint.billing.subscription.renewsAt)}`}
            </>
          ) : (
            "None"
          )}
        </dd>
        {!complaint.billingHidden && (
          <>
            <dt className="text-text-dim">Recent payments</dt>
            <dd className="text-text-secondary">
              {complaint.billing && complaint.billing.payments.length > 0 ? (
                <ul className="space-y-0.5">
                  {complaint.billing.payments.map((p) => (
                    <li key={p.id}>
                      {formatDate(p.createdAt)} · {money(p.amountCents, p.currency)} · {p.purpose.replace(/_/g, " ")} · {p.status}
                    </li>
                  ))}
                </ul>
              ) : (
                "None"
              )}
            </dd>
          </>
        )}
      </dl>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-dim">Thread</div>
        <ul className="max-h-80 space-y-1.5 overflow-y-auto rounded-md border border-border-subtle bg-canvas p-2">
          <li className="rounded-md bg-surface px-2 py-1.5 text-xs">
            <div className="flex justify-between gap-2 text-[10px] text-text-dim">
              <span>Member · complaint</span>
              <span>{new Date(complaint.createdAt).toLocaleString()}</span>
            </div>
            <div className="mt-0.5 whitespace-pre-wrap text-text-primary">{complaint.message}</div>
          </li>
          {complaint.messages.map((m) => (
            <li key={m.id} className={`rounded-md px-2 py-1.5 text-xs ${m.sender === "admin" ? "bg-accent/10" : "bg-surface"}`}>
              <div className="flex justify-between gap-2 text-[10px] text-text-dim">
                <span>{m.sender === "admin" ? `Fynrox · ${m.senderAdminName ?? "staff"}` : "Member"}</span>
                <span>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-0.5 whitespace-pre-wrap text-text-primary">{m.body}</div>
            </li>
          ))}
        </ul>
        {canEdit && !closed && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (reply.trim() && !send.isPending) send.mutate();
            }}
            className="mt-2 flex gap-2"
          >
            <label className="sr-only" htmlFor={`reply-${complaint.id}`}>
              Reply to the member
            </label>
            <textarea
              id={`reply-${complaint.id}`}
              rows={2}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Reply to the member (they see it in their ticket)"
              className={`flex-1 ${INPUT_CLASS}`}
            />
            <button
              type="submit"
              disabled={!reply.trim() || send.isPending}
              className="self-end rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-40"
            >
              {send.isPending ? "Sending…" : "Send"}
            </button>
          </form>
        )}
        {send.isError && <p className="mt-1 text-xs text-danger">{extractErrorMessage(send.error, "The reply wasn't sent.")}</p>}
      </div>

      {complaint.events.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-dim">History</div>
          <ul className="space-y-0.5 text-[11px] text-text-dim">
            {complaint.events.map((e) => (
              <li key={e.id}>
                {new Date(e.at).toLocaleString()} · {EVENT_LABELS[e.action] ?? e.action}
                {e.byName ? ` · ${e.byName}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {closed ? (
        <div className="rounded-md border border-border-subtle p-3 text-xs text-text-secondary">
          <div className="font-medium text-text-primary">Outcome: {complaint.outcome ? OUTCOME_LABELS[complaint.outcome] : ""}</div>
          <div className="mt-1 text-text-dim">
            {complaint.closedByName ? `By ${complaint.closedByName}` : ""}
            {complaint.closedAt ? `, ${new Date(complaint.closedAt).toLocaleString()}` : ""}
            {complaint.closedLate ? " · after the resolve-by date" : ""}
          </div>
          {complaint.resolutionNote && <p className="mt-2 whitespace-pre-wrap">{complaint.resolutionNote}</p>}
        </div>
      ) : canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canClose && outcome) close.mutate({ outcome, reason: note.trim() });
          }}
          className="space-y-2 rounded-md border border-border-subtle p-3"
        >
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-text-secondary">Close with an outcome</legend>
            {(Object.keys(OUTCOME_LABELS) as ComplaintOutcome[]).map((o) => (
              <label key={o} className="flex items-start gap-2 text-xs text-text-primary">
                <input type="radio" name={`outcome-${complaint.id}`} value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="mt-0.5" />
                <span>
                  {OUTCOME_LABELS[o]}
                  <span className="block text-[11px] text-text-dim">{OUTCOME_HINTS[o]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Resolution note for the member (at least 10 characters)
            <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT_CLASS} />
          </label>
          {close.isError && <p className="text-xs text-danger">{extractErrorMessage(close.error, "The complaint wasn't closed.")}</p>}
          <button type="submit" disabled={!canClose} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40">
            {close.isPending ? "Closing…" : "Close complaint"}
          </button>
          <p className="text-[11px] text-text-dim">
            The member gets this note in their ticket with the outcome, and a notification. A closed complaint can't be reopened or
            changed.
          </p>
        </form>
      )}
    </div>
  );
}
