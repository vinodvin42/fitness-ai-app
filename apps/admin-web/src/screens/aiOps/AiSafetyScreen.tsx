import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminAiAnswerReportDetail,
  AdminAiAnswerReportListResponse,
  AiAnswerReportReason,
  AiAnswerReportStatus,
  ResolveAiAnswerReportInput,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { AI_OPS_SUB_NAV } from "./subNav";

const REASON_LABELS: Record<AiAnswerReportReason, string> = {
  unsafe_or_harmful: "Unsafe or harmful",
  medically_wrong: "Medically wrong",
  offensive: "Offensive",
  other: "Other",
};

const STATUS_LABELS: Record<AiAnswerReportStatus, string> = {
  open: "Open",
  reviewed: "Reviewed — no problem",
  answer_hidden: "Answer hidden",
};

const OVERRIDE_LABELS: Record<string, string> = {
  "ai_answer.hidden": "Answer hidden",
  "ai_coach_settings.enabled": "AI Coach turned on",
  "ai_coach_settings.disabled": "AI Coach turned off",
};

const SELECT_CLASS =
  "rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent";

/**
 * 11.03 AI Safety / Overrides (docs/admin/03-screen-inventory.md §11.03),
 * Oct 2026 — AI Coach answers people reported in the app (Google Play
 * requires in-app reporting for apps with generative AI). See
 * listAiAnswerReports in apps/api's adminAiOps.service.ts.
 *
 * These are health conversations: only the Super Admin and the
 * safety/privacy role can open this screen (the API's sensitiveData
 * permission), the list shows no message text, and opening a report is
 * audit-logged. A report is either marked reviewed (the answer was fine) or
 * the answer is hidden from the person's chat and from what the AI sees
 * next. The overrides log lists every such change, plus AI Coach on/off.
 */
export function AiSafetyScreen() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AiAnswerReportStatus | "">("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["admin-ai-reports", status],
    queryFn: () =>
      apiClient.get<AdminAiAnswerReportListResponse>("/admin/ai-ops/reports", { params: { status: status || undefined } }).then((r) => r.data),
  });
  const detail = useQuery({
    queryKey: ["admin-ai-report", selectedId],
    queryFn: () => apiClient.get<AdminAiAnswerReportDetail>(`/admin/ai-ops/reports/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const share = list.data?.stats.reportedShare;

  return (
    <AppShell title="AI Safety" subNav={AI_OPS_SUB_NAV}>
      <div className="space-y-4">
        {list.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(list.error, "Couldn't load AI reports.")}
          </div>
        )}
        {list.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {list.data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Open reports" value={list.data.stats.open} />
              <StatCard label="Reported this week" value={list.data.stats.reportedThisWeek} />
              <StatCard label="Answers this week" value={list.data.stats.answersThisWeek} />
              <StatCard label="Share reported" value={share == null ? "—" : `${(share * 100).toFixed(1)}%`} />
            </div>

            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value as AiAnswerReportStatus | "")} className={SELECT_CLASS}>
                  <option value="open">Open</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="answer_hidden">Answer hidden</option>
                  <option value="">All</option>
                </select>
              </label>
              <p className="text-xs text-text-dim">Message text is shown only when you open a report, and each opening is logged.</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
                {list.data.reports.length === 0 && <p className="px-4 py-8 text-center text-sm text-text-dim">No reports here.</p>}
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
                          <span className="text-sm font-medium text-text-primary">{REASON_LABELS[r.reason]}</span>
                          {r.hasNote && <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-text-dim">has a note</span>}
                          <span className="ml-auto text-xs text-text-dim">{r.ageHours < 48 ? `${r.ageHours} h` : `${Math.floor(r.ageHours / 24)} d`}</span>
                        </div>
                        <div className="mt-1 text-xs text-text-secondary">
                          {STATUS_LABELS[r.status]}
                          {r.reviewedByName ? ` · ${r.reviewedByName}` : ""}
                          {!r.answerStillInChat ? " · person cleared their chat" : ""}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                {!selectedId && <p className="text-sm text-text-dim">Select a report to read the question and the answer.</p>}
                {selectedId && detail.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
                {selectedId && detail.isError && <p className="text-sm text-danger">{extractErrorMessage(detail.error, "Couldn't load this report.")}</p>}
                {detail.data && detail.data.id === selectedId && (
                  <AiReportDetail
                    report={detail.data}
                    onResolved={() => {
                      queryClient.invalidateQueries({ queryKey: ["admin-ai-reports"] });
                      queryClient.invalidateQueries({ queryKey: ["admin-ai-report", selectedId] });
                    }}
                  />
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface">
              <div className="px-4 pt-4 text-sm font-medium">Overrides log</div>
              <p className="px-4 text-xs text-text-dim">Every change staff made to AI Coach: answers hidden, and AI Coach turned on or off.</p>
              <table className="mt-2 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-2 font-normal">When</th>
                    <th className="px-4 py-2 font-normal">Change</th>
                    <th className="px-4 py-2 font-normal">By</th>
                    <th className="px-4 py-2 font-normal">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.overrides.map((o) => (
                    <tr key={o.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-2 text-text-secondary">{new Date(o.at).toLocaleString()}</td>
                      <td className="px-4 py-2 text-text-primary">{OVERRIDE_LABELS[o.action] ?? o.action}</td>
                      <td className="px-4 py-2 text-text-secondary">{o.byName ?? "—"}</td>
                      <td className="px-4 py-2 text-text-secondary">{o.note ?? "—"}</td>
                    </tr>
                  ))}
                  {list.data.overrides.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-text-dim">
                        No changes yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <NotAvailablePanel keys={list.data.notAvailable} subtitle="No moderation model checks answers automatically yet." />
          </>
        )}
      </div>
    </AppShell>
  );
}

function AiReportDetail({ report, onResolved }: { report: AdminAiAnswerReportDetail; onResolved: () => void }) {
  const [action, setAction] = useState<ResolveAiAnswerReportInput["action"] | "">("");
  const [note, setNote] = useState("");
  const resolve = useMutation({
    mutationFn: (input: ResolveAiAnswerReportInput) => apiClient.post(`/admin/ai-ops/reports/${report.id}/resolve`, input),
    onSuccess: () => {
      setAction("");
      setNote("");
      onResolved();
    },
  });
  const canSubmit = action !== "" && note.trim().length >= 10 && !resolve.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-text-primary">{REASON_LABELS[report.reason]}</h2>
        <p className="mt-1 text-xs text-text-dim">
          Reported {new Date(report.createdAt).toLocaleString()} by{" "}
          <Link to={`/users/${report.user.id}`} className="text-accent hover:underline">
            {report.user.fullName}
          </Link>
        </p>
      </div>

      {report.note && (
        <div className="text-xs">
          <div className="text-text-dim">Their words</div>
          <p className="mt-0.5 whitespace-pre-wrap text-text-secondary">{report.note}</p>
        </div>
      )}

      <div className="space-y-2">
        <div className="rounded-md bg-surface-raised p-3 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-text-dim">Question</div>
          <p className="mt-1 whitespace-pre-wrap text-text-primary">{report.question ?? "—"}</p>
        </div>
        <div className="rounded-md border border-danger/40 bg-danger/5 p-3 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-text-dim">
            AI Coach answer{report.answerHidden ? " · hidden" : ""}
            {!report.answerStillInChat ? " · no longer in their chat" : ""}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-text-primary">{report.answer}</p>
        </div>
        {report.sources.length > 0 && (
          <p className="text-[11px] text-text-dim">Based on: {report.sources.map((s) => s.label).join(", ")}</p>
        )}
      </div>

      {report.status === "open" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit && action) resolve.mutate({ action, reason: note.trim() });
          }}
          className="space-y-2 rounded-md border border-border-subtle p-3"
        >
          <div className="text-xs font-medium text-text-secondary">Decision</div>
          <label className="flex items-start gap-2 text-xs text-text-primary">
            <input type="radio" name="ai-action" checked={action === "reviewed"} onChange={() => setAction("reviewed")} className="mt-0.5" />
            <span>Reviewed — the answer is fine</span>
          </label>
          <label className="flex items-start gap-2 text-xs text-text-primary">
            <input
              type="radio"
              name="ai-action"
              checked={action === "hide_answer"}
              onChange={() => setAction("hide_answer")}
              className="mt-0.5"
              disabled={!report.answerStillInChat}
            />
            <span>
              Hide the answer from their chat and from what the AI sees next
              {!report.answerStillInChat && <span className="block text-[11px] text-text-dim">They already cleared their chat.</span>}
            </span>
          </label>
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
          <p className="text-[11px] text-text-dim">The person who reported it is told the outcome in the app.</p>
        </form>
      ) : (
        <div className="rounded-md border border-border-subtle p-3 text-xs text-text-secondary">
          <div className="font-medium text-text-primary">{STATUS_LABELS[report.status]}</div>
          <div className="mt-1 text-text-dim">
            {report.reviewedByName ? `By ${report.reviewedByName}` : ""}
            {report.reviewedAt ? `, ${new Date(report.reviewedAt).toLocaleString()}` : ""}
          </div>
          {report.reviewNote && <p className="mt-2 whitespace-pre-wrap">{report.reviewNote}</p>}
        </div>
      )}
    </div>
  );
}
