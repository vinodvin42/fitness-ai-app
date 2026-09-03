import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminAuditLogDirectoryResponse, AuditLogActorType } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ADMIN_SYSTEM_SUB_NAV } from "./subNav";

const ACTOR_TYPE_LABELS: Record<string, string> = { user: "User", admin: "Admin", professional: "Professional" };

interface Filters {
  actorType: AuditLogActorType | "";
  search: string;
  startDate: string;
  endDate: string;
}

async function fetchAuditLogs(filters: Filters): Promise<AdminAuditLogDirectoryResponse> {
  const res = await apiClient.get<AdminAuditLogDirectoryResponse>("/admin/audit-logs", {
    params: {
      actorType: filters.actorType || undefined,
      search: filters.search || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    },
  });
  return res.data;
}

/** Escapes one CSV field — wraps in quotes and doubles any embedded quote, only when the value actually needs it (RFC 4180). */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(entries: AdminAuditLogDirectoryResponse["entries"]) {
  const header = ["Timestamp", "Actor Type", "Actor", "Actor Email", "Action", "Entity Type", "Entity Id", "Metadata"];
  const rows = entries.map((e) => [
    e.createdAt,
    e.actorType ?? "",
    e.actorLabel ?? "",
    e.actorEmail ?? "",
    e.action,
    e.entityType,
    e.entityId ?? "",
    e.metadata ? JSON.stringify(e.metadata) : "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvField).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 12.03 Audit Logs (docs/admin/03-screen-inventory.md §12.03), added 22
 * Aug 2026 — the first genuinely unscoped, filterable, cross-entity view
 * of the real `AuditLog` table. See apps/api's adminAuditLogs.service.ts
 * for the full real-vs-not breakdown: the table, filters, and stats are
 * real; "Export" is a real client-side CSV of the rows currently loaded
 * (no fabricated endpoint); "paginated" is deliberately NOT real
 * pagination — this caps at the most-recent 200 matching rows and shows
 * an honest "showing N of totalCount" notice rather than either faking
 * full pagination or silently under-reporting when there's more.
 * `entityType`/`action` have no fixed enum to filter by (new modules add
 * new action strings as they ship), so `search` is a free-text box
 * against both rather than a dropdown that would silently go stale.
 */
export function AuditLogsScreen() {
  const [filters, setFilters] = useState<Filters>({ actorType: "", search: "", startDate: "", endDate: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-audit-logs", filters],
    queryFn: () => fetchAuditLogs(filters),
  });

  return (
    <AppShell title="Audit Logs" subNav={ADMIN_SYSTEM_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Total (in scope)" value={data.stats.totalCount} />
            <StatCard label="Admin Actions" value={data.stats.adminActions} />
            <StatCard label="User Actions" value={data.stats.userActions} />
            <StatCard label="Professional Actions" value={data.stats.professionalActions} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Actor
            <select
              value={filters.actorType}
              onChange={(e) => setFilter("actorType", e.target.value as Filters["actorType"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
              <option value="professional">Professional</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            From
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilter("startDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            To
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilter("endDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Search
            <input
              type="search"
              placeholder="Action or entity type…"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-56 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            disabled={!data || data.entries.length === 0}
            onClick={() => data && downloadCsv(data.entries)}
            className="ml-auto rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⬇ Export CSV
          </button>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load audit logs.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data?.truncated && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            Showing the most recent {data.entries.length} of {data.stats.totalCount} matching entries. Narrow the
            filters above to see more specific results — this screen doesn't paginate through the full history yet.
          </div>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <div className="flex items-center gap-1.5 border-b border-border-subtle px-4 py-2 text-xs text-text-dim">
              🔒 Write-once — nothing on this screen or its API can edit or delete an entry.
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">Actor</th>
                  <th className="px-4 py-3 font-normal">Action</th>
                  <th className="px-4 py-3 font-normal">Entity</th>
                  <th className="px-4 py-3 font-normal">Metadata</th>
                  <th className="px-4 py-3 font-normal">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className="border-b border-border-subtle last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-text-dim">
                        {e.actorType ? ACTOR_TYPE_LABELS[e.actorType] ?? e.actorType : "—"}
                      </div>
                      <div className="font-medium text-text-primary">{e.actorLabel ?? "—"}</div>
                      {e.actorEmail && <div className="text-xs text-text-dim">{e.actorEmail}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{e.action}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {e.entityType}
                      {e.entityId && <div className="font-mono text-xs text-text-dim">{e.entityId}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {e.metadata ? (
                        <button
                          type="button"
                          onClick={() => setExpandedId((prev) => (prev === e.id ? null : e.id))}
                          className="text-xs text-accent hover:underline"
                        >
                          {expandedId === e.id ? "Hide" : "View"}
                        </button>
                      ) : (
                        <span className="text-xs text-text-dim">—</span>
                      )}
                      {expandedId === e.id && e.metadata && (
                        <pre className="mt-2 max-w-xs overflow-x-auto rounded-md bg-surface-raised p-2 text-[11px] text-text-secondary">
                          {JSON.stringify(e.metadata, null, 2)}
                        </pre>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {data.entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-dim">
                      No audit entries match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
