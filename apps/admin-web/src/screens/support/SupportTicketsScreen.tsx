import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminSupportTicketDetailResponse,
  AdminSupportTicketDirectoryResponse,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  UpdateAdminSupportTicketInput,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { SUPPORT_SUB_NAV } from "./subNav";

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  feature_request: "Feature Request",
  billing: "Billing",
  account: "Account",
  other: "Other",
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
  "admin.supportTicket.updated": "Triage updated",
};

interface Filters {
  status: SupportTicketStatus | "";
  category: SupportTicketCategory | "";
  priority: SupportTicketPriority | "";
  search: string;
}

async function fetchDirectory(filters: Filters): Promise<AdminSupportTicketDirectoryResponse> {
  const res = await apiClient.get<AdminSupportTicketDirectoryResponse>("/admin/support-tickets", {
    params: {
      status: filters.status || undefined,
      category: filters.category || undefined,
      priority: filters.priority || undefined,
      search: filters.search || undefined,
    },
  });
  return res.data;
}

async function fetchDetail(id: string): Promise<AdminSupportTicketDetailResponse> {
  const res = await apiClient.get<AdminSupportTicketDetailResponse>(`/admin/support-tickets/${id}`);
  return res.data;
}

/**
 * 08.01 Support Tickets (docs/admin/03-screen-inventory.md §08.01), added
 * 22 Aug 2026 — the console's first split-panel screen (list left, detail
 * right, both visible at once), matching the Figma's own explicit "Split
 * panel" layout instruction rather than this build's usual separate
 * Directory+Detail routes. Selection is local component state, not a URL
 * param — there's no deep-linking need the Figma spec calls for here.
 *
 * See apps/api's adminSupport.service.ts for the full real-vs-not
 * breakdown: the list, filters, and stats bar are real; the real action is
 * re-triaging Status/Priority/Category, backed by a real audited history
 * trail below the message. Also explains why this module was picked over
 * Module 07 — Growth this cycle.
 *
 * **25 Aug 2026:** a second real action joins Triage — "Escalate" (08.02),
 * additive alongside it, not a replacement. It doesn't touch the ticket's
 * own Status/Priority; it just records that this ticket needs attention
 * beyond first-line support, with a reason, visible in the new
 * Escalations queue (`/support/escalations`, `EscalationsScreen.tsx`).
 * Disabled once the ticket already has an open escalation — the backend
 * guards this too (`escalation_already_open`), the button just avoids
 * surfacing that as a confusing error.
 *
 * **3 Sep 2026:** the detail panel's message is no longer read-only — a
 * real "Conversation" section (right below the ticket's original message)
 * shows the full `SupportTicketMessage` thread and a real reply composer,
 * closing the "conversationThread" gap this comment used to name. Replying
 * does not itself change Status/Priority — those stay Triage's own
 * separate, explicit action.
 */
export function SupportTicketsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ status: "", category: "", priority: "", search: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UpdateAdminSupportTicketInput>({});
  const [escalateReason, setEscalateReason] = useState("");
  const [replyDraft, setReplyDraft] = useState("");

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-support-tickets", filters],
    queryFn: () => fetchDirectory(filters),
  });

  const {
    data: detail,
    isLoading: isDetailLoading,
    isError: isDetailError,
  } = useQuery({
    queryKey: ["admin-support-ticket-detail", selectedId],
    queryFn: () => fetchDetail(selectedId as string),
    enabled: !!selectedId,
  });

  // Reset the triage draft to the ticket's real current values whenever a
  // different ticket is selected (or its detail (re)loads) — not a
  // one-time initial state, so switching tickets never carries a stale
  // draft over.
  useEffect(() => {
    if (detail?.ticket) {
      setDraft({ status: detail.ticket.status, priority: detail.ticket.priority, category: detail.ticket.category });
    }
  }, [detail?.ticket.id, detail?.ticket.status, detail?.ticket.priority, detail?.ticket.category]);

  const updateMutation = useMutation({
    mutationFn: () => apiClient.patch(`/admin/support-tickets/${selectedId}`, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-ticket-detail", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: () => apiClient.post(`/admin/support-tickets/${selectedId}/escalate`, { reason: escalateReason }),
    onSuccess: () => {
      setEscalateReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-support-ticket-detail", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["admin-escalations"] });
    },
  });

  // Support Ticket Messages (added 3 Sep 2026) — the real composer behind
  // the Conversation section below. See adminSupport.service.ts.
  const sendMessageMutation = useMutation({
    mutationFn: () => apiClient.post(`/admin/support-tickets/${selectedId}/messages`, { body: replyDraft.trim() }),
    onSuccess: () => {
      setReplyDraft("");
      queryClient.invalidateQueries({ queryKey: ["admin-support-ticket-detail", selectedId] });
    },
  });

  const ticket = detail?.ticket;
  const isDirty = !!ticket && (draft.status !== ticket.status || draft.priority !== ticket.priority || draft.category !== ticket.category);

  return (
    <AppShell title={t("supportTickets.supportTickets")} subNav={SUPPORT_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-4 gap-3">
            <StatCard label={t("supportTickets.open")} value={data.stats.open} />
            <StatCard label={t("supportTickets.inProgress")} value={data.stats.inProgress} />
            <StatCard label={t("supportTickets.resolved")} value={data.stats.resolved} />
            <StatCard label={t("supportTickets.closed")} value={data.stats.closed} />
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4">
          {/* Left panel — filterable list */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border-subtle bg-surface p-3">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("supportTickets.status")}
                <select
                  value={filters.status}
                  onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="">{t("supportTickets.all")}</option>
                  <option value="open">{t("supportTickets.open")}</option>
                  <option value="in_progress">{t("supportTickets.inProgress")}</option>
                  <option value="resolved">{t("supportTickets.resolved")}</option>
                  <option value="closed">{t("supportTickets.closed")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("supportTickets.category")}
                <select
                  value={filters.category}
                  onChange={(e) => setFilter("category", e.target.value as Filters["category"])}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="">{t("supportTickets.all")}</option>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("supportTickets.priority")}
                <select
                  value={filters.priority}
                  onChange={(e) => setFilter("priority", e.target.value as Filters["priority"])}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="">{t("supportTickets.all")}</option>
                  <option value="low">{t("supportTickets.low")}</option>
                  <option value="normal">{t("supportTickets.normal")}</option>
                  <option value="high">{t("supportTickets.high")}</option>
                </select>
              </label>
              <label className="flex flex-1 min-w-[140px] flex-col gap-1 text-xs text-text-dim">
                {t("supportTickets.search")}
                <input
                  type="search"
                  placeholder={t("supportTickets.subjectMessageUser")}
                  value={filters.search}
                  onChange={(e) => setFilter("search", e.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>

            {isLoading && <p className="text-sm text-text-secondary">{t("supportTickets.loading")}</p>}
            {isError && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                {extractErrorMessage(error, "Couldn't load support tickets.")}
                <button type="button" onClick={() => refetch()} className="ml-3 underline">
                  {t("supportTickets.retry")}
                </button>
              </div>
            )}

            {data && (
              <div className="max-h-[600px] overflow-y-auto rounded-lg border border-border-subtle bg-surface">
                <ul className="divide-y divide-border-subtle">
                  {data.tickets.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(t.id);
                          setReplyDraft("");
                        }}
                        className={`block w-full px-4 py-3 text-left transition-colors ${
                          selectedId === t.id ? "bg-accent/10" : "hover:bg-surface-raised"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-text-primary">{t.subject}</span>
                          <StatusBadge status={t.status} />
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-text-dim">
                          <span>{t.userFullName}</span>
                          <span>·</span>
                          <span>{CATEGORY_LABELS[t.category] ?? t.category}</span>
                          <span>·</span>
                          <StatusBadge status={t.priority} />
                        </div>
                      </button>
                    </li>
                  ))}
                  {data.tickets.length === 0 && (
                    <li className="px-4 py-8 text-center text-sm text-text-dim">{t("supportTickets.noTicketsMatchThese")}</li>
                  )}
                </ul>
              </div>
            )}

            {data && (
              <NotAvailablePanel
                keys={data.notAvailable}
                subtitle={t("supportTickets.noBackingDataExists")}
              />
            )}
          </div>

          {/* Right panel — selected ticket detail */}
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            {!selectedId && (
              <p className="text-sm text-text-dim">{t("supportTickets.selectATicketFrom")}</p>
            )}

            {selectedId && isDetailLoading && <p className="text-sm text-text-secondary">{t("supportTickets.loading")}</p>}

            {selectedId && isDetailError && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                {t("supportTickets.couldnTLoadThis")}
              </div>
            )}

            {ticket && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-text-primary">{ticket.subject}</h2>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <div className="mt-1 text-xs text-text-dim">
                    {ticket.userFullName} ({ticket.userEmail}) · Opened {new Date(ticket.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="rounded-md border border-border-subtle bg-surface-raised p-3">
                  <div className="text-xs uppercase tracking-wide text-text-dim">{t("supportTickets.message")}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{ticket.message}</p>
                </div>

                <div className="rounded-md border border-border-subtle p-3">
                  <div className="text-xs uppercase tracking-wide text-text-dim">{t("supportTickets.conversation")}</div>
                  <div className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-2">
                    {(detail?.messages ?? []).length === 0 && (
                      <p className="px-1 py-2 text-center text-xs text-text-dim">{t("supportTickets.noRepliesYet")}</p>
                    )}
                    {(detail?.messages ?? []).map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-md p-2 text-xs ${m.sender === "admin" ? "ml-6 bg-accent/10" : "mr-6 bg-surface"}`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] text-text-dim">
                          <span>{m.sender === "admin" ? (m.senderAdminName ?? "Admin") : ticket.userFullName}</span>
                          <span>{new Date(m.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-text-secondary">{m.body}</p>
                      </div>
                    ))}
                  </div>
                  <textarea
                    placeholder={t("supportTickets.writeAReply")}
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    className="mt-2 w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                    rows={2}
                  />
                  <button
                    type="button"
                    disabled={!replyDraft.trim() || sendMessageMutation.isPending}
                    onClick={() => sendMessageMutation.mutate()}
                    className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("supportTickets.sendReply")}
                  </button>
                  {sendMessageMutation.isError && (
                    <p className="mt-2 text-xs text-danger">
                      {extractErrorMessage(sendMessageMutation.error, "That reply didn't send.")}
                    </p>
                  )}
                </div>

                <div className="rounded-md border border-border-subtle p-3">
                  <div className="text-xs uppercase tracking-wide text-text-dim">{t("supportTickets.triage")}</div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1 text-xs text-text-dim">
                      {t("supportTickets.status")}
                      <select
                        value={draft.status}
                        onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as SupportTicketStatus }))}
                        className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                      >
                        <option value="open">{t("supportTickets.open")}</option>
                        <option value="in_progress">{t("supportTickets.inProgress")}</option>
                        <option value="resolved">{t("supportTickets.resolved")}</option>
                        <option value="closed">{t("supportTickets.closed")}</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-dim">
                      {t("supportTickets.priority")}
                      <select
                        value={draft.priority}
                        onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as SupportTicketPriority }))}
                        className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                      >
                        <option value="low">{t("supportTickets.low")}</option>
                        <option value="normal">{t("supportTickets.normal")}</option>
                        <option value="high">{t("supportTickets.high")}</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-dim">
                      {t("supportTickets.category")}
                      <select
                        value={draft.category}
                        onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as SupportTicketCategory }))}
                        className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                      >
                        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={!isDirty || updateMutation.isPending}
                    onClick={() => updateMutation.mutate()}
                    className="mt-3 rounded-md border border-accent px-3 py-1.5 text-xs text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("supportTickets.saveTriage")}
                  </button>
                  {updateMutation.isError && (
                    <p className="mt-2 text-xs text-danger">
                      {extractErrorMessage(updateMutation.error, "That change didn't save.")}
                    </p>
                  )}
                </div>

                <NotAvailablePanel
                  keys={detail?.notAvailable ?? []}
                  subtitle={t("supportTickets.noBackingDataExists")}
                />

                <div className="rounded-md border border-border-subtle p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-wide text-text-dim">{t("supportTickets.escalation")}</div>
                    {detail?.escalation && <StatusBadge status={detail.escalation.status} />}
                  </div>
                  {detail?.escalation ? (
                    <div className="mt-2 text-xs text-text-secondary">
                      <p>
                        <span className="text-text-dim">{t("supportTickets.reason")}</span>
                        {detail.escalation.reason}
                      </p>
                      <p className="mt-1 text-text-dim">
                        Raised by {detail.escalation.escalatedByName} on{" "}
                        {new Date(detail.escalation.createdAt).toLocaleDateString()}
                        {detail.escalation.resolvedAt &&
                          ` · resolved by ${detail.escalation.resolvedByName} on ${new Date(
                            detail.escalation.resolvedAt,
                          ).toLocaleDateString()}`}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-text-dim">{t("supportTickets.thisTicketHasnT")}</p>
                  )}
                  {(!detail?.escalation || detail.escalation.status === "resolved") && (
                    <div className="mt-3">
                      <textarea
                        placeholder={t("supportTickets.whyDoesThisNeed")}
                        value={escalateReason}
                        onChange={(e) => setEscalateReason(e.target.value)}
                        className="w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                        rows={2}
                      />
                      <button
                        type="button"
                        disabled={!escalateReason.trim() || escalateMutation.isPending}
                        onClick={() => escalateMutation.mutate()}
                        className="mt-2 rounded-md border border-accent px-3 py-1.5 text-xs text-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t("supportTickets.escalate")}
                      </button>
                      {escalateMutation.isError && (
                        <p className="mt-2 text-xs text-danger">
                          {extractErrorMessage(escalateMutation.error, "That didn't go through.")}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-text-dim">{t("supportTickets.triageHistory")}</div>
                  <ul className="mt-2 divide-y divide-border-subtle rounded-md border border-border-subtle">
                    {(detail?.history ?? []).map((h) => (
                      <li key={h.id} className="px-3 py-2">
                        <div className="text-xs text-text-primary">{HISTORY_ACTION_LABELS[h.action] ?? h.action}</div>
                        <div className="text-[11px] text-text-dim">{new Date(h.createdAt).toLocaleString()}</div>
                        {h.metadata?.changes != null && (
                          <div className="mt-1 text-[11px] text-text-secondary">
                            {Object.entries(h.metadata.changes as Record<string, { from: string; to: string }>)
                              .map(([field, c]) => `${field}: ${c.from} → ${c.to}`)
                              .join(", ")}
                          </div>
                        )}
                      </li>
                    ))}
                    {(detail?.history ?? []).length === 0 && (
                      <li className="px-3 py-4 text-center text-xs text-text-dim">{t("supportTickets.noTriageChangesYet")}</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
