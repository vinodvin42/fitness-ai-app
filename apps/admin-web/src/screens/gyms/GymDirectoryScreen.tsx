import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AdminGymDirectoryResponse, CreateGymInput, GymStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { GYMS_SUB_NAV } from "./subNav";

const STATUS_FILTERS: { key: GymStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "application", label: "Application" },
  { key: "approved", label: "Approved" },
  { key: "suspended", label: "Suspended" },
];

const EMPTY_CREATE_INPUT: CreateGymInput = {
  name: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  commissionPct: 15,
  pricingModel: "per_member_flat_fee",
  ratePerMemberCents: 0,
};

async function fetchDirectory(status: GymStatus | "all", search: string): Promise<AdminGymDirectoryResponse> {
  const res = await apiClient.get<AdminGymDirectoryResponse>("/admin/gyms", {
    params: { status: status === "all" ? undefined : status, search: search || undefined },
  });
  return res.data;
}

/**
 * Gym Partner Lite (R2 Wave 4, 20 Sep 2026) — the real admin-web Directory
 * over R2 Wave 1's real `gyms.service.ts`/`gyms.routes.ts`. Same
 * table/status-filter/search shape as `ProfessionalDirectoryScreen.tsx`
 * (Module 03's own established directory convention), minus that screen's
 * tab-count pills — `listGyms()` has no per-status count aggregate, so this
 * screen filters client-request-side via `status` query param instead of
 * faking counts it doesn't have.
 *
 * No client-side permission check gates this screen or the Add Gym form —
 * same "rely on the real server-side 403" precedent
 * `ProfessionalDirectoryScreen.tsx`/`ProfessionalProfileScreen.tsx` already
 * establish (see docs/admin/07-open-questions-gaps.md's Wave 2 entries):
 * every mutation here already requires `gyms:create`/`gyms:edit`/
 * `gyms:approve` server-side via `requirePermission`, and a non-permitted
 * admin role simply gets a real 403 surfaced through `extractErrorMessage`.
 */
export function GymDirectoryScreen() {
  const [status, setStatus] = useState<GymStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CreateGymInput>(EMPTY_CREATE_INPUT);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-gyms", status, search],
    queryFn: () => fetchDirectory(status, search),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateGymInput) => apiClient.post("/admin/gyms", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-gyms"] });
      setForm(EMPTY_CREATE_INPUT);
      setShowAddForm(false);
    },
  });

  const isFormValid = form.name.trim().length > 0 && form.contactName.trim().length > 0 && form.contactEmail.trim().length > 0;

  return (
    <AppShell title="Gym Partners" subNav={GYMS_SUB_NAV}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  status === f.key
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border-subtle text-text-secondary hover:text-text-primary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Search name, contact, invite code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
            >
              {showAddForm ? "Cancel" : "Add Gym"}
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-text-dim">New Gym Partner</div>
            <p className="mt-1 text-xs text-text-secondary">
              Starts in <span className="font-medium">Application</span> status — approve it from the row actions once
              onboarded. Commission % and pricing default to placeholder values you can edit here or later from the
              gym's own profile.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledInput
                label="Gym name"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              />
              <LabeledInput
                label="Contact name"
                value={form.contactName}
                onChange={(v) => setForm((f) => ({ ...f, contactName: v }))}
              />
              <LabeledInput
                label="Contact email"
                type="email"
                value={form.contactEmail}
                onChange={(v) => setForm((f) => ({ ...f, contactEmail: v }))}
              />
              <LabeledInput
                label="Contact phone (optional)"
                value={form.contactPhone ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, contactPhone: v }))}
              />
              <LabeledInput
                label="Commission %"
                type="number"
                value={String(form.commissionPct ?? 15)}
                onChange={(v) => setForm((f) => ({ ...f, commissionPct: Number(v) || 0 }))}
              />
              <LabeledInput
                label="Rate per member (cents, 0 = not configured)"
                type="number"
                value={String(form.ratePerMemberCents ?? 0)}
                onChange={(v) => setForm((f) => ({ ...f, ratePerMemberCents: Number(v) || 0 }))}
              />
            </div>
            <button
              type="button"
              disabled={!isFormValid || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
              className="mt-3 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {createMutation.isPending ? "Creating…" : "Create Gym"}
            </button>
            {createMutation.isError && (
              <p className="mt-2 text-xs text-danger">{extractErrorMessage(createMutation.error, "Couldn't create that gym.")}</p>
            )}
          </div>
        )}

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load gym partners.")}
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
                  <th className="px-4 py-3 font-normal">Gym</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Commission</th>
                  <th className="px-4 py-3 font-normal">Locations</th>
                  <th className="px-4 py-3 font-normal">Members</th>
                  <th className="px-4 py-3 font-normal">Invite Code</th>
                  <th className="px-4 py-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.gyms.map((g) => (
                  <tr key={g.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{g.name}</div>
                      <div className="text-xs text-text-dim">
                        {g.contactName} · {g.contactEmail}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={g.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{g.commissionPct}%</td>
                    <td className="px-4 py-3 text-text-secondary">{g.locationCount}</td>
                    <td className="px-4 py-3 text-text-secondary">{g.memberCount}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-dim">{g.inviteCode}</td>
                    <td className="px-4 py-3">
                      <Link to={`/gyms/${g.id}`} className="text-xs text-accent hover:underline">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.gyms.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-dim">
                      No gym partners in this view.
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

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] text-text-dim">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
      />
    </label>
  );
}
