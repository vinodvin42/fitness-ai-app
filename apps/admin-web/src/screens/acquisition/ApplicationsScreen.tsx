import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminPublicApplicationListItem,
  AdminPublicApplicationListResponse,
  PublicApplicationKind,
  PublicApplicationStatus,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { GROWTH_SUB_NAV } from "../growth/subNav";

const KIND_LABELS: Record<PublicApplicationKind, string> = {
  early_access: "Early Access",
  gym: "Gym",
  creator: "Creator",
  professional: "Professional",
  contact: "Contact",
};

const STATUSES: PublicApplicationStatus[] = ["new", "in_review", "contacted", "converted", "rejected"];

async function fetchApplications(kind: string, status: string): Promise<AdminPublicApplicationListResponse> {
  const params = new URLSearchParams({ take: "100" });
  if (kind) params.set("kind", kind);
  if (status) params.set("status", status);
  const res = await apiClient.get<AdminPublicApplicationListResponse>(`/admin/applications?${params.toString()}`);
  return res.data;
}

/**
 * Applications & Early Access — the queue behind the public website's
 * forms (spec §8; `apps/api/src/modules/publicApplications`).
 *
 * It exists because the alternative is worse than the `mailto:` link
 * those forms replaced: a form that writes to a table nobody can read
 * collects a promise the business cannot keep, and does it at a higher
 * rate than an inbox because it looks official.
 *
 * Routed under Growth rather than Users. These are leads and partner
 * applications, not accounts — the same reasoning that puts Campaigns
 * and the Acquisition Report here — and the API gates both endpoints on
 * the `growth` permission to match.
 *
 * Deliberately NOT a detail screen. Every field a submission carries is
 * on the row already; a second click to read four sentences of free text
 * would be ceremony, not information.
 */
export function ApplicationsScreen() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const applications = useQuery({
    queryKey: ["admin-applications", kind, status],
    queryFn: () => fetchApplications(kind, status),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, nextStatus, note }: { id: string; nextStatus: PublicApplicationStatus; note?: string }) =>
      apiClient.patch(`/admin/applications/${id}`, {
        status: nextStatus,
        ...(note ? { adminNote: note } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-applications"] }),
  });

  const items = applications.data?.items ?? [];
  // Counted from the rows on screen rather than fetched separately: with
  // a filter applied these are counts OF THE FILTER, which is what an
  // admin working one kind of application actually wants to see.
  const newCount = items.filter((i) => i.status === "new").length;
  const partnerCount = items.filter((i) => i.kind !== "early_access" && i.kind !== "contact").length;

  function submissionDetail(row: AdminPublicApplicationListItem): string {
    // One line per row rather than a detail page — see the doc comment.
    return [row.organisation, row.detail, row.city].filter(Boolean).join(" · ") || "—";
  }

  return (
    <AppShell title="Applications & Early Access" subNav={GROWTH_SUB_NAV}>
      <div className="space-y-4">
        {applications.data && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Shown" value={items.length} />
            <StatCard label="Unworked (new)" value={newCount} />
            <StatCard label="Partner applications" value={partnerCount} />
            <StatCard label="Total matching" value={applications.data.total} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Form
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              {(Object.keys(KIND_LABELS) as PublicApplicationKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>

        {applications.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {applications.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(applications.error, "Couldn't load applications.")}
            <button type="button" onClick={() => applications.refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {applications.data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">Who</th>
                  <th className="px-4 py-3 font-normal">Form</th>
                  <th className="px-4 py-3 font-normal">Details</th>
                  <th className="px-4 py-3 font-normal">Message</th>
                  <th className="px-4 py-3 font-normal">Source</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Move to</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-border-subtle align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{row.fullName}</div>
                      <div className="text-xs text-text-secondary">{row.email}</div>
                      {row.phone && <div className="text-xs text-text-dim">{row.phone}</div>}
                      <div className="text-xs text-text-dim">{new Date(row.createdAt).toLocaleDateString()}</div>
                      {/* Contact consent is never shown as a state: a row
                          cannot exist without it, so a column for it would
                          always read the same. Marketing consent is real
                          and genuinely varies, so it is the one shown. */}
                      {row.consentMarketing && (
                        <div className="text-xs text-accent">opted into updates</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{KIND_LABELS[row.kind]}</td>
                    <td className="max-w-[16rem] px-4 py-3 text-text-secondary">{submissionDetail(row)}</td>
                    <td className="max-w-[22rem] whitespace-pre-wrap px-4 py-3 text-text-secondary">
                      {row.message ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-dim">
                      {row.sourceCode ? `${row.sourceKind ?? "?"} · ${row.sourceCode}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                      {row.adminNote && <div className="mt-1 text-xs text-text-dim">{row.adminNote}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        placeholder="Note (optional)"
                        value={noteDraft[row.id] ?? ""}
                        onChange={(e) => setNoteDraft((p) => ({ ...p, [row.id]: e.target.value }))}
                        className="mb-2 w-40 rounded-md border border-border-subtle bg-surface-raised px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                      />
                      <div className="flex flex-wrap gap-2">
                        {STATUSES.filter((s) => s !== row.status).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={updateMutation.isPending && updateMutation.variables?.id === row.id}
                            onClick={() =>
                              updateMutation.mutate({ id: row.id, nextStatus: s, note: noteDraft[row.id] })
                            }
                            className="text-xs text-accent hover:underline disabled:opacity-50"
                          >
                            {s.replace("_", " ")}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-dim">
                      Nothing matching that filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {updateMutation.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(updateMutation.error, "Couldn't update that application.")}
          </div>
        )}
      </div>
    </AppShell>
  );
}
