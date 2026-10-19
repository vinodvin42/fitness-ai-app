import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminSafetyReportDetail,
  AdminSafetyReportListResponse,
  ResolveSafetyReportInput,
  SafetyReportOutcome,
  SafetyReportReason,
  SafetyReportSeverity,
  SafetyReportStatus,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { SUPPORT_SUB_NAV } from "./subNav";

const REASON_LABELS: Record<SafetyReportReason, string> = {
  harassment: "Harassment or bullying",
  sexual_content: "Sexual or inappropriate content",
  threats_or_hate: "Threats or hate",
  spam_or_scam: "Spam or scam",
  unsafe_advice: "Unsafe health advice",
  impersonation: "Fake credentials or impersonation",
  other: "Other",
};

const OUTCOME_LABELS: Record<SafetyReportOutcome, string> = {
  dismissed: "Dismiss — nothing wrong found",
  warning: "Warn the reported person",
  message_removed: "Remove the reported message",
  account_suspended: "Account suspended",
};

const SELECT_CLASS =
  "rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent";

function profilePath(kind: "user" | "professional", id: string): string {
  return kind === "user" ? `/users/${id}` : `/professionals/${id}`;
}

function age(hours: number): string {
  return hours < 1 ? "under 1 h" : hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

/**
 * 08.04 Safety & Abuse Reports (docs/admin/03-screen-inventory.md §08.04),
 * Oct 2026 — the queue for reports made from coach ↔ client chat (GET/POST
 * /admin/safety-reports; see adminSafetyReports.service.ts). App-store rules
 * for apps where people message each other require reports to be acted on
 * promptly; the staff target is 24 hours, shown as "overdue".
 *
 * Left: the queue (high severity and oldest first). Right: the selected
 * report with the conversation around the reported message — opening one is
 * audit-logged because it shows private messages. Outcomes: dismiss, warn,
 * remove the message, or record a suspension that was made on the person's
 * profile (this screen never suspends anyone itself).
 */
export function SafetyReportsScreen() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SafetyReportStatus | "">("open");
  const [severity, setSeverity] = useState<SafetyReportSeverity | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["admin-safety-reports", status, severity],
    queryFn: () =>
      apiClient
        .get<AdminSafetyReportListResponse>("/admin/safety-reports", { params: { status: status || undefined, severity: severity || undefined } })
        .then((r) => r.data),
  });

  const detail = useQuery({
    queryKey: ["admin-safety-report", selectedId],
    queryFn: () => apiClient.get<AdminSafetyReportDetail>(`/admin/safety-reports/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  return (
    <AppShell title="Safety Reports" subNav={SUPPORT_SUB_NAV}>
      <div className="space-y-4">
        {list.data && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Open" value={list.data.stats.open} />
            <StatCard label="High severity open" value={list.data.stats.highOpen} />
            <StatCard label={`Open over ${list.data.stats.overdueHours} h`} value={list.data.stats.overdue} hint="Staff target: act within a day" />
            <StatCard label="Actioned this week" value={list.data.stats.actionedThisWeek} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as SafetyReportStatus | "")} className={SELECT_CLASS}>
              <option value="open">Open</option>
              <option value="actioned">Actioned</option>
              <option value="dismissed">Dismissed</option>
              <option value="">All</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Severity
            <select value={severity} onChange={(e) => setSeverity(e.target.value as SafetyReportSeverity | "")} className={SELECT_CLASS}>
              <option value="">All</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
          </label>
        </div>

        {list.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {list.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(list.error, "Couldn't load reports.")}
            <button type="button" onClick={() => list.refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {list.data && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
              {list.data.reports.length === 0 && <p className="px-4 py-8 text-center text-sm text-text-dim">No reports match these filters.</p>}
              <ul>
                {list.data.reports.map((r) => (
                  <li key={r.id} className="border-b border-border-subtle last:border-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      aria-current={selectedId === r.id ? "true" : undefined}
                      className={`w-full px-4 py-3 text-left ${selectedId === r.id ? "bg-surface-raised" : "hover:bg-surface-raised"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${r.severity === "high" ? "bg-danger" : "bg-border-subtle"}`}
                          aria-label={r.severity === "high" ? "High severity" : "Normal severity"}
                        />
                        <span className="text-sm font-medium text-text-primary">{REASON_LABELS[r.reason]}</span>
                        {r.overdue && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] text-danger">Overdue</span>}
                        <span className="ml-auto text-xs text-text-dim">{age(r.ageHours)}</span>
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {r.reporter ? `${r.reporter.name} (${r.reporter.kind === "user" ? "client" : "coach"})` : "Deleted account"} reported{" "}
                        {r.reported ? `${r.reported.name} (${r.reported.kind === "user" ? "client" : "coach"})` : "a deleted account"}
                      </div>
                      {r.excerpt && <div className="mt-1 truncate text-xs text-text-dim">“{r.excerpt}”</div>}
                      {r.status !== "open" && (
                        <div className="mt-1 text-[11px] text-text-dim">
                          {r.status === "dismissed" ? "Dismissed" : `Actioned: ${r.outcome ? OUTCOME_LABELS[r.outcome].split(" —")[0] : ""}`}
                          {r.resolvedByName ? ` by ${r.resolvedByName}` : ""}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              {!selectedId && <p className="text-sm text-text-dim">Select a report to see the details and the conversation.</p>}
              {selectedId && detail.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
              {selectedId && detail.isError && <p className="text-sm text-danger">{extractErrorMessage(detail.error, "Couldn't load this report.")}</p>}
              {detail.data && detail.data.id === selectedId && (
                <ReportDossier
                  report={detail.data}
                  onResolved={() => {
                    queryClient.invalidateQueries({ queryKey: ["admin-safety-reports"] });
                    queryClient.invalidateQueries({ queryKey: ["admin-safety-report", selectedId] });
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ReportDossier({ report, onResolved }: { report: AdminSafetyReportDetail; onResolved: () => void }) {
  const [outcome, setOutcome] = useState<SafetyReportOutcome | "">("");
  const [note, setNote] = useState("");
  const resolve = useMutation({
    mutationFn: (input: ResolveSafetyReportInput) => apiClient.post(`/admin/safety-reports/${report.id}/resolve`, input),
    onSuccess: () => {
      setOutcome("");
      setNote("");
      onResolved();
    },
  });

  const reportedSuspended = report.reported?.accountStatus === "suspended";
  const outcomes: SafetyReportOutcome[] = ["dismissed", "warning", ...(report.messageId ? (["message_removed"] as const) : []), "account_suspended"];
  const canSubmit = outcome !== "" && note.trim().length >= 10 && (outcome !== "account_suspended" || reportedSuspended) && !resolve.isPending;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-text-primary">{REASON_LABELS[report.reason]}</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${report.severity === "high" ? "bg-danger/15 text-danger" : "bg-surface-raised text-text-dim"}`}
          >
            {report.severity === "high" ? "High severity" : "Normal"}
          </span>
        </div>
        <p className="mt-1 text-xs text-text-dim">Reported {new Date(report.createdAt).toLocaleString()}</p>
      </div>

      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-text-dim">Reported by</dt>
        <dd className="text-text-secondary">
          {report.reporter ? (
            <Link to={profilePath(report.reporter.kind, report.reporter.id)} className="text-accent hover:underline">
              {report.reporter.name}
            </Link>
          ) : (
            "Deleted account"
          )}{" "}
          {report.reporter && <span className="text-text-dim">({report.reporter.kind === "user" ? "client" : "coach"})</span>}
        </dd>
        <dt className="text-text-dim">Reported</dt>
        <dd className="text-text-secondary">
          {report.reported ? (
            <>
              <Link to={profilePath(report.reported.kind, report.reported.id)} className="text-accent hover:underline">
                {report.reported.name}
              </Link>{" "}
              <span className="text-text-dim">
                ({report.reported.kind === "user" ? "client" : "coach"}, {report.reported.accountStatus})
              </span>
            </>
          ) : (
            "Deleted account"
          )}
        </dd>
        <dt className="text-text-dim">Earlier reports</dt>
        <dd className="text-text-secondary">{report.priorReportsAgainstReported} against the same person</dd>
        {report.details && (
          <>
            <dt className="text-text-dim">Their words</dt>
            <dd className="whitespace-pre-wrap text-text-secondary">{report.details}</dd>
          </>
        )}
      </dl>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-dim">Conversation</div>
        {report.context.length === 0 ? (
          <p className="text-xs text-text-dim">{report.messageExcerpt ? `Reported message: “${report.messageExcerpt}”` : "No messages between them."}</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border border-border-subtle bg-canvas p-2">
            {report.context.map((m) => (
              <li
                key={m.id}
                className={`rounded-md px-2 py-1.5 text-xs ${m.reported ? "border border-danger/50 bg-danger/10" : "bg-surface"}`}
              >
                <div className="flex justify-between gap-2 text-[10px] text-text-dim">
                  <span>{m.sender === "user" ? "Client" : "Coach"}</span>
                  <span>
                    {new Date(m.createdAt).toLocaleString()}
                    {m.reported ? " · reported" : ""}
                    {m.removed ? " · removed" : ""}
                  </span>
                </div>
                <div className={`mt-0.5 whitespace-pre-wrap ${m.removed ? "text-text-dim line-through" : "text-text-primary"}`}>{m.content}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {report.status === "open" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit && outcome) resolve.mutate({ outcome, reason: note.trim() });
          }}
          className="space-y-2 rounded-md border border-border-subtle p-3"
        >
          <div className="text-xs font-medium text-text-secondary">Decision</div>
          {outcomes.map((o) => (
            <label key={o} className="flex items-start gap-2 text-xs text-text-primary">
              <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="mt-0.5" />
              <span>
                {OUTCOME_LABELS[o]}
                {o === "account_suspended" && !reportedSuspended && report.reported && (
                  <span className="block text-[11px] text-text-dim">
                    Suspend them first on their{" "}
                    <Link to={profilePath(report.reported.kind, report.reported.id)} className="text-accent hover:underline">
                      profile
                    </Link>{" "}
                    (reason required there), then record it here.
                  </span>
                )}
                {o === "warning" && report.reported?.kind === "professional" && (
                  <span className="block text-[11px] text-text-dim">Coaches have no in-app inbox yet, so contact them directly.</span>
                )}
              </span>
            </label>
          ))}
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Note for the record (at least 10 characters)
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised p-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          {resolve.isError && <p className="text-xs text-danger">{extractErrorMessage(resolve.error, "The decision wasn't saved.")}</p>}
          <button type="submit" disabled={!canSubmit} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40">
            {resolve.isPending ? "Saving…" : "Save decision"}
          </button>
          <p className="text-[11px] text-text-dim">
            A client who reported is told it was reviewed, never what happened to the other person.
          </p>
        </form>
      ) : (
        <div className="rounded-md border border-border-subtle p-3 text-xs text-text-secondary">
          <div className="font-medium text-text-primary">
            {report.status === "dismissed" ? "Dismissed" : `Actioned: ${report.outcome ? OUTCOME_LABELS[report.outcome] : ""}`}
          </div>
          <div className="mt-1 text-text-dim">
            {report.resolvedByName ? `By ${report.resolvedByName}` : ""}
            {report.resolvedAt ? `, ${new Date(report.resolvedAt).toLocaleString()}` : ""}
          </div>
          {report.resolutionNote && <p className="mt-2 whitespace-pre-wrap">{report.resolutionNote}</p>}
        </div>
      )}
    </div>
  );
}
