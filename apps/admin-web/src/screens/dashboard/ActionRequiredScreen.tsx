import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminAccountDirectoryResponse,
  AdminActionItem,
  AdminActionItemListResponse,
  AdminActionItemSeverity,
  AdminActionItemStatus,
  AdminActionItemType,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { ReasonGatedAction } from "../../components/ReasonGatedAction";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { useAuth } from "../../lib/auth";
import { DASHBOARD_SUB_NAV } from "./subNav";

const TYPE_OPTIONS: AdminActionItemType[] = [
  "entitlement_activation_failed",
  "professional_acceptance_stalled",
  "relationship_activation_failed",
  "credential_expiring",
  "payout_failed",
  "refund_impact",
  "chargeback",
  "safety_escalation",
  "privacy_request",
  "professional_complaint",
  "partner_abuse_review",
  "access_revocation_failed",
  "support_ticket_open",
  "support_escalation",
  "relationship_change_pending",
  "credential_verification_pending",
];

function typeLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SEVERITY_RANK: Record<AdminActionItemSeverity, number> = { high: 3, medium: 2, low: 1 };

function SeverityBadge({ severity }: { severity: AdminActionItemSeverity }) {
  const toneClass =
    severity === "high" ? "bg-danger/15 text-danger" : severity === "medium" ? "bg-warning/15 text-warning" : "bg-surface-raised text-text-dim";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {severity[0].toUpperCase() + severity.slice(1)}
    </span>
  );
}

/**
 * Real drill-through targets for the 7 sources already wired into
 * `createActionItem` as of R2 Wave 1 + Wave 4's own addition (see
 * apps/api's lib/adminActionQueue.ts call sites). Two of the seven resolve
 * to a real per-entity detail route (Relationship, and ProfessionalCredential
 * via its metadata.professionalId — the credential itself has no detail
 * route, but the professional it belongs to does); the other five have a
 * real queue/list screen but no id-addressable detail route yet, so they
 * link to that list rather than a broken per-row URL — "show the available
 * context inline rather than a broken link," per this wave's own brief.
 * Documented per-type in docs/admin/07-open-questions-gaps.md.
 */
function getDrillThrough(item: AdminActionItem): { label: string; to: string; exact: boolean } | null {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  switch (item.entityType) {
    case "Relationship":
      return { label: "Open relationship", to: `/relationships/${item.entityId}`, exact: true };
    case "ProfessionalCredential": {
      const professionalId = typeof meta.professionalId === "string" ? meta.professionalId : null;
      return professionalId
        ? { label: "Open professional", to: `/professionals/${professionalId}`, exact: true }
        : { label: "Open credential queue", to: "/professionals/verification", exact: false };
    }
    case "SupportTicket":
      return { label: "Open support tickets", to: "/support", exact: false };
    case "Escalation":
      return { label: "Open escalations", to: "/support/escalations", exact: false };
    case "SafetyEscalation":
      return { label: "Open safety escalations", to: "/support/safety-escalations", exact: false };
    case "RelationshipChangeRequest":
      return { label: "Open change queue", to: "/relationships/change-queue", exact: false };
    case "Refund":
      return { label: "Open refunds", to: "/commerce/refunds", exact: false };
    default:
      return null;
  }
}

type Filters = {
  type: AdminActionItemType | "";
  severity: AdminActionItemSeverity | "";
  status: AdminActionItemStatus | "";
  assignedToAdminId: string;
};

type SortKey = "severity" | "createdAt";

async function fetchActionItems(filters: Filters): Promise<AdminActionItemListResponse> {
  const res = await apiClient.get<AdminActionItemListResponse>("/admin/action-items", {
    params: {
      type: filters.type || undefined,
      severity: filters.severity || undefined,
      status: filters.status || undefined,
      assignedToAdminId: filters.assignedToAdminId || undefined,
    },
  });
  return res.data;
}

async function fetchAdminDirectory(): Promise<AdminAccountDirectoryResponse> {
  const res = await apiClient.get<AdminAccountDirectoryResponse>("/admin/admin-users");
  return res.data;
}

/**
 * Admin Action Required queue screen — Developer 3's §3 first-listed
 * "Dashboard / Action Required" functional area, closing the gap R2 Wave 1
 * deliberately left open (see that wave's own comment on
 * apps/api/src/lib/adminActionQueue.ts and adminActionQueue.routes.ts: "the
 * real dashboard screen is Wave 4's own unit"). Real read/filter against
 * the live GET /admin/action-items, real Assign (self or another admin) and
 * Resolve (required reason via ReasonGatedAction) against the live
 * POST /admin/action-items/:id/assign|resolve. No new backend write-path —
 * all three endpoints, and the underlying `createActionItem`/
 * `assignActionItem`/`resolveActionItem` helpers, already shipped real and
 * tested in R2 Wave 1.
 *
 * Page-load/manual-refresh only, same as every other queue screen in this
 * build (SafetyEscalationsScreen, EscalationsScreen, SupportTicketsScreen)
 * — this codebase has no real-time/websocket infra anywhere, so a live-
 * updating queue was explicitly out of scope for this wave.
 *
 * Assign/Resolve are gated server-side on `dashboard: edit`, which only
 * `super_admin` holds today (see adminPermissions.ts's own comment on that
 * grant) — every role with `dashboard: view` can see and filter this queue,
 * but the assign/resolve controls will 403 for non-super_admin roles. That
 * ownership question ("who besides super_admin should be able to triage
 * this queue") is explicitly deferred, same as R2 Wave 1 left it; this
 * screen doesn't hide the controls for a non-super_admin viewer (matching
 * this codebase's existing convention of surfacing a real 403 from
 * extractErrorMessage rather than guessing client-side who holds which
 * grant), so a non-super_admin admin will see the buttons and get a clear
 * "does not have edit access" error if they try.
 */
export function ActionRequiredScreen() {
  const { adminUser: viewer } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ type: "", severity: "", status: "open", assignedToAdminId: "" });
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [assignSelection, setAssignSelection] = useState<Record<string, string>>({});

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-action-items", filters],
    queryFn: () => fetchActionItems(filters),
  });

  // Best-effort — only super_admin (the same role that can actually assign/
  // resolve) holds `admin: view`, so this can 403 for other viewers. That's
  // fine: the assign-to-another-admin picker just falls back to id-only
  // entry below instead of a name-labeled dropdown.
  const adminDirectory = useQuery({
    queryKey: ["admin-accounts-for-action-queue"],
    queryFn: () => fetchAdminDirectory(),
    retry: false,
  });
  const adminNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of adminDirectory.data?.adminUsers ?? []) map.set(a.id, a.fullName);
    return map;
  }, [adminDirectory.data]);

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["admin-action-items"] });

  const assignMutation = useMutation({
    mutationFn: ({ id, adminId }: { id: string; adminId: string }) =>
      apiClient.post(`/admin/action-items/${id}/assign`, { adminId }),
    onSuccess: invalidateAll,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, resolutionNote }: { id: string; resolutionNote: string }) =>
      apiClient.post(`/admin/action-items/${id}/resolve`, { resolutionNote }),
    onSuccess: invalidateAll,
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const sortedItems = useMemo(() => {
    const items = data?.items ?? [];
    const copy = [...items];
    if (sortKey === "severity") {
      copy.sort(
        (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.createdAt.localeCompare(a.createdAt),
      );
    } else {
      copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return copy;
  }, [data, sortKey]);

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return {
      total: items.length,
      high: items.filter((i) => i.severity === "high").length,
      medium: items.filter((i) => i.severity === "medium").length,
      low: items.filter((i) => i.severity === "low").length,
    };
  }, [data]);

  return (
    <AppShell title="Action Required" subNav={DASHBOARD_SUB_NAV}>
      <div className="space-y-4">
        <div className="rounded-lg border border-border-subtle bg-surface/50 p-4 text-xs text-text-secondary">
          The unified exception queue (`AdminActionItem`) every real source in this build funnels into — see
          apps/api's lib/adminActionQueue.ts. This is a page-load/manual-refresh read, not a live-updating feed;
          use Refresh (below) to pull the latest rows.
        </div>

        {data && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Matching this filter" value={counts.total} />
            <StatCard label="High severity" value={counts.high} />
            <StatCard label="Medium severity" value={counts.medium} />
            <StatCard label="Low severity" value={counts.low} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Type
            <select
              value={filters.type}
              onChange={(e) => setFilter("type", e.target.value as Filters["type"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Severity
            <select
              value={filters.severity}
              onChange={(e) => setFilter("severity", e.target.value as Filters["severity"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="">All</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Assigned to
            {adminDirectory.data ? (
              <select
                value={filters.assignedToAdminId}
                onChange={(e) => setFilter("assignedToAdminId", e.target.value)}
                className="w-48 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="">Anyone</option>
                {adminDirectory.data.adminUsers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder="Admin id…"
                value={filters.assignedToAdminId}
                onChange={(e) => setFilter("assignedToAdminId", e.target.value)}
                className="w-48 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            )}
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Sort by
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="severity">Severity</option>
              <option value="createdAt">Newest first</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => refetch()}
            className="ml-auto rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent"
          >
            Refresh
          </button>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load the action queue.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && sortedItems.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-subtle bg-surface/50 p-8 text-center text-sm text-text-dim">
            No action items match these filters.
          </div>
        )}

        {sortedItems.map((item) => {
          const drillThrough = getDrillThrough(item);
          const assignedName = item.assignedToAdminId ? (adminNameById.get(item.assignedToAdminId) ?? item.assignedToAdminId) : null;
          const resolvedName = item.resolvedByAdminId ? (adminNameById.get(item.resolvedByAdminId) ?? item.resolvedByAdminId) : null;
          const metaEntries = Object.entries(item.metadata ?? {});

          return (
            <div
              key={item.id}
              className={`rounded-lg border p-4 ${
                item.status === "open" && item.severity === "high"
                  ? "border-danger/40 bg-danger/5"
                  : "border-border-subtle bg-surface"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{typeLabel(item.type)}</span>
                    <SeverityBadge severity={item.severity} />
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-1 text-xs text-text-dim">
                    {item.entityType} ·{" "}
                    {drillThrough ? (
                      <Link to={drillThrough.to} className="text-accent hover:underline">
                        {drillThrough.exact ? drillThrough.label : `${drillThrough.label} (no per-item detail route yet)`}
                      </Link>
                    ) : (
                      <span>
                        {item.entityId} (no real detail screen wired up for {item.entityType} yet)
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-text-dim">{new Date(item.createdAt).toLocaleString()}</span>
              </div>

              {metaEntries.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                  {metaEntries.map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-xs text-text-dim">{typeLabel(key)}</dt>
                      <dd className="text-text-secondary">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                {item.assignedToAdminId ? (
                  <span>
                    Assigned to <span className="font-medium text-text-primary">{assignedName}</span>
                  </span>
                ) : (
                  <span className="text-text-dim">Unassigned</span>
                )}
                {item.status === "resolved" && (
                  <span>
                    · Resolved by <span className="font-medium text-text-primary">{resolvedName ?? "—"}</span> on{" "}
                    {item.resolvedAt ? new Date(item.resolvedAt).toLocaleString() : "—"}
                  </span>
                )}
              </div>

              {item.status === "resolved" && item.resolutionNote && (
                <p className="mt-2 text-xs text-text-secondary">
                  <span className="text-text-dim">Resolution note: </span>
                  {item.resolutionNote}
                </p>
              )}

              {item.status === "open" && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={assignMutation.isPending || !viewer}
                      onClick={() => viewer && assignMutation.mutate({ id: item.id, adminId: viewer.id })}
                      className="rounded-md border border-accent/40 px-2.5 py-1 text-xs text-accent disabled:opacity-40"
                    >
                      Assign to me
                    </button>

                    {adminDirectory.data ? (
                      <select
                        value={assignSelection[item.id] ?? ""}
                        onChange={(e) => setAssignSelection((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                      >
                        <option value="">Assign to…</option>
                        {adminDirectory.data.adminUsers.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.fullName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        placeholder="Admin id…"
                        value={assignSelection[item.id] ?? ""}
                        onChange={(e) => setAssignSelection((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-40 rounded-md border border-border-subtle bg-surface-raised px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                      />
                    )}
                    <button
                      type="button"
                      disabled={assignMutation.isPending || !assignSelection[item.id]}
                      onClick={() => assignMutation.mutate({ id: item.id, adminId: assignSelection[item.id] })}
                      className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary disabled:opacity-40"
                    >
                      Assign
                    </button>
                  </div>
                  {assignMutation.isError && (
                    <p className="text-xs text-danger">
                      {extractErrorMessage(assignMutation.error, "That assignment didn't go through.")}
                    </p>
                  )}

                  <ReasonGatedAction
                    title="Resolve"
                    description="Record why this item is resolved — the same reason+confirmation discipline BR-ADM-005 requires everywhere else in this console."
                    actionLabel="Resolve"
                    tone="warning"
                    isPending={resolveMutation.isPending}
                    isError={resolveMutation.isError}
                    error={resolveMutation.error}
                    onConfirm={(reason) => resolveMutation.mutate({ id: item.id, resolutionNote: reason })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
