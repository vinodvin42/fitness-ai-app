import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AdminRelationshipDirectoryResponse, ProfessionalServiceType, RelationshipStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { RELATIONSHIPS_SUB_NAV } from "./subNav";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

interface Filters {
  serviceType: ProfessionalServiceType | "";
  status: RelationshipStatus | "";
  search: string;
  startDate: string;
  endDate: string;
}

async function fetchDirectory(filters: Filters): Promise<AdminRelationshipDirectoryResponse> {
  const res = await apiClient.get<AdminRelationshipDirectoryResponse>("/admin/relationships", {
    params: {
      serviceType: filters.serviceType || undefined,
      status: filters.status || undefined,
      search: filters.search || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    },
  });
  return res.data;
}

/**
 * 04.01 Relationship Directory (docs/admin/03-screen-inventory.md §04) —
 * the first real screen in Module 04, added 21 Aug 2026. Real filters
 * (Service type, Status, a createdAt date range, plus a name/email search
 * the Figma doesn't explicitly spec but every other directory screen in
 * this console has) against the real `Relationship` model — see
 * apps/api's adminRelationships.service.ts for exactly which Figma-spec'd
 * columns/filters (Pricing, Sessions, Payments, Country) have no backing
 * field and are surfaced via `NotAvailablePanel` below rather than faked.
 *
 * **25 Aug 2026:** the coach Discovery & Booking flow shipped, so this
 * screen shows real rows once real bookings come in rather than being
 * guaranteed empty — and Module 04 gained its second nav-level screen
 * (the Change/Intervention Queue), so this screen now renders
 * `RELATIONSHIPS_SUB_NAV`.
 */
export function RelationshipDirectoryScreen() {
  const [filters, setFilters] = useState<Filters>({
    serviceType: "",
    status: "",
    search: "",
    startDate: "",
    endDate: "",
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-relationships", filters],
    queryFn: () => fetchDirectory(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <AppShell title="Relationship Directory" subNav={RELATIONSHIPS_SUB_NAV}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Service
            <select
              value={filters.serviceType}
              onChange={(e) => setFilter("serviceType", e.target.value as Filters["serviceType"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="fitness">Fitness</option>
              <option value="nutrition">Nutrition</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="ended">Ended</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Start from
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilter("startDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Start to
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilter("endDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          <label className="ml-auto flex flex-col gap-1 text-xs text-text-dim">
            Search
            <input
              type="search"
              placeholder="User or professional…"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-56 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load relationships.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">User</th>
                  <th className="px-4 py-3 font-normal">Professional</th>
                  <th className="px-4 py-3 font-normal">Service</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Start</th>
                  <th className="px-4 py-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.relationships.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{r.userFullName}</div>
                      <div className="text-xs text-text-dim">{r.userEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{r.professionalFullName}</div>
                      <div className="text-xs text-text-dim">{r.professionalEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{SERVICE_LABELS[r.serviceType] ?? r.serviceType}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link to={`/relationships/${r.id}`} className="text-xs text-accent hover:underline">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.relationships.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-dim">
                      No relationships match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <NotAvailablePanel
            keys={data.notAvailable}
            subtitle="No backing field exists yet for these Figma-spec'd directory columns/filters — see adminRelationships.service.ts."
          />
        )}
      </div>
    </AppShell>
  );
}
