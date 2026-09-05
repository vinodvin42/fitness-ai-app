import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminProgramDirectoryResponse, AdminProgramListItem, ProgramType } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { PROGRAMS_SUB_NAV } from "./subNav";

const TYPE_LABELS: Record<ProgramType, string> = { fitness: "Fitness", nutrition: "Nutrition", combined: "Combined" };
const TYPE_OPTIONS: ProgramType[] = ["fitness", "nutrition", "combined"];

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

interface Filters {
  type: ProgramType | "";
  status: "draft" | "published" | "";
  search: string;
  startDate: string;
  endDate: string;
}

interface FormState {
  name: string;
  type: ProgramType;
  description: string;
  durationWeeks: string;
  isAiOnly: boolean;
  priceDisplay: string;
  imageUrl: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  type: "fitness",
  description: "",
  durationWeeks: "4",
  isAiOnly: true,
  priceDisplay: "0.00",
  imageUrl: "",
};

async function fetchDirectory(filters: Filters): Promise<AdminProgramDirectoryResponse> {
  const res = await apiClient.get<AdminProgramDirectoryResponse>("/admin/programs", {
    params: {
      type: filters.type || undefined,
      status: filters.status || undefined,
      search: filters.search || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    },
  });
  return res.data;
}

function formToPayload(form: FormState) {
  return {
    name: form.name,
    type: form.type,
    description: form.description,
    durationWeeks: Number(form.durationWeeks),
    isAiOnly: form.isAiOnly,
    priceCents: Math.round(Number(form.priceDisplay || "0") * 100),
    // Omitted rather than sent empty when blank — the API validates this
    // with Zod's `.url()`, which an empty string fails. Same handling as
    // the Exercises directory's own Media URL field.
    imageUrl: form.imageUrl || undefined,
  };
}

/**
 * 05.01 Programs (docs/admin/03-screen-inventory.md §05.01) — the Programs
 * CMS's flagship screen, added 22 Aug 2026. Every spec'd column and filter
 * is real — see apps/api's adminPrograms.service.ts doc comment. Shares
 * `PROGRAMS_SUB_NAV` with Exercises (05.02), Recipes (05.03), and
 * Review/Approval (05.05).
 *
 * "Creator" filter (the Figma spec's fourth filter) isn't wired as a
 * dropdown this pass — it would need a separate admin-list fetch just to
 * populate it, and Creator is already visible as a real column per row.
 * UI chrome, not a missing data field — same "documented as a code
 * comment, not NotAvailablePanel" precedent as every other Directory
 * screen's omitted bulk-select/pagination.
 *
 * No delete — Program cascade-deletes real Workout/WorkoutExercise/
 * ExerciseSetLog/ProgramPurchase rows, an irreversible blast radius this
 * pass doesn't build a confirmation flow for. Unpublish (fully reversible,
 * hides from consumer discovery) covers the realistic need instead.
 *
 * **25 Aug 2026:** draft rows also get a "Submit for Review" action
 * (alongside, not instead of, the direct Publish button) — see
 * ReviewQueueScreen.tsx and adminPrograms.service.ts's 05.05 section for
 * what that queue does and why it doesn't gate Publish.
 */
export function ProgramsDirectoryScreen() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ type: "", status: "", search: "", startDate: "", endDate: "" });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-programs", filters],
    queryFn: () => fetchDirectory(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["admin-programs"] });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) => apiClient.post("/admin/programs", payload),
    onSuccess: () => {
      invalidateAll();
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof formToPayload> }) =>
      apiClient.patch(`/admin/programs/${id}`, payload),
    onSuccess: () => {
      invalidateAll();
      closeForm();
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/programs/${id}/publish`),
    onSuccess: invalidateAll,
  });

  const unpublishMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/programs/${id}/unpublish`),
    onSuccess: invalidateAll,
  });

  const submitReviewMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/programs/${id}/submit-review`),
    onSuccess: invalidateAll,
  });

  function startEdit(p: AdminProgramListItem) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      type: p.type,
      description: p.description,
      durationWeeks: String(p.durationWeeks),
      isAiOnly: p.isAiOnly,
      priceDisplay: (p.priceCents / 100).toFixed(2),
      imageUrl: p.imageUrl ?? "",
    });
    setShowForm(true);
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm((prev) => !prev);
  }

  const savePending = createMutation.isPending || updateMutation.isPending;
  const saveError = createMutation.error ?? updateMutation.error;

  return (
    <AppShell title="Programs" subNav={PROGRAMS_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total Programs" value={data.counts.total} />
            <StatCard label="Published" value={data.counts.published} />
            <StatCard label="Draft" value={data.counts.draft} />
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
                  {TYPE_LABELS[t]}
                </option>
              ))}
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
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Created from
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilter("startDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Created to
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
              placeholder="Name or description…"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-56 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          <button
            type="button"
            onClick={startCreate}
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
          >
            {showForm && !editingId ? "Cancel" : "+ Create Program"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const payload = formToPayload(form);
              if (editingId) updateMutation.mutate({ id: editingId, payload });
              else createMutation.mutate(payload);
            }}
            className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{editingId ? "Edit Program" : "Create Program"}</div>
              {editingId && (
                <button type="button" onClick={closeForm} className="text-xs text-text-dim hover:text-text-primary">
                  Cancel
                </button>
              )}
            </div>
            {!editingId && (
              <p className="text-xs text-text-secondary">
                New programs start as a Draft — not visible to consumers until you Publish them.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Type
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as ProgramType }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Description
              <textarea
                required
                rows={3}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="rounded-md border border-border-subtle bg-surface-raised p-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Cover image URL (optional)
              <input
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                placeholder="https://…"
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Duration (weeks)
                <input
                  required
                  type="number"
                  min={1}
                  max={104}
                  value={form.durationWeeks}
                  onChange={(e) => setForm((prev) => ({ ...prev, durationWeeks: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Price (USD)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceDisplay}
                  onChange={(e) => setForm((prev) => ({ ...prev, priceDisplay: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex items-end gap-2 pb-1.5 text-xs text-text-dim">
                <input
                  type="checkbox"
                  checked={form.isAiOnly}
                  onChange={(e) => setForm((prev) => ({ ...prev, isAiOnly: e.target.checked }))}
                  className="h-4 w-4"
                />
                AI-only (no human coach)
              </label>
            </div>
            {saveError && (
              <p className="text-xs text-danger">{extractErrorMessage(saveError, "Couldn't save this program.")}</p>
            )}
            <button
              type="submit"
              disabled={savePending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {savePending ? "Saving…" : editingId ? "Save Changes" : "Create Program"}
            </button>
          </form>
        )}

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load programs.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {(publishMutation.isError || unpublishMutation.isError || submitReviewMutation.isError) && (
          <p className="text-xs text-danger">
            {extractErrorMessage(
              publishMutation.error ?? unpublishMutation.error ?? submitReviewMutation.error,
              "That action didn't go through.",
            )}
          </p>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">Cover</th>
                  <th className="px-4 py-3 font-normal">Name</th>
                  <th className="px-4 py-3 font-normal">Creator</th>
                  <th className="px-4 py-3 font-normal">Type</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Duration</th>
                  <th className="px-4 py-3 font-normal">Exercises</th>
                  <th className="px-4 py-3 font-normal">Subscribers</th>
                  <th className="px-4 py-3 font-normal">Updated</th>
                  <th className="px-4 py-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.programs.map((p) => (
                  <tr key={p.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-10 w-16 rounded object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-text-dim">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{p.name}</div>
                      <div className="text-xs text-text-dim">{money(p.priceCents)}{p.isAiOnly ? " · AI-only" : ""}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{p.creatorName ?? "—"}</td>
                    <td className="px-4 py-3 text-text-secondary">{TYPE_LABELS[p.type]}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{p.durationWeeks}w</td>
                    <td className="px-4 py-3 text-text-secondary">{p.exerciseCount}</td>
                    <td className="px-4 py-3 text-text-secondary">{p.subscriberCount}</td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(p.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                        >
                          Edit
                        </button>
                        {p.status === "published" ? (
                          <button
                            type="button"
                            disabled={unpublishMutation.isPending}
                            onClick={() => unpublishMutation.mutate(p.id)}
                            className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-danger hover:text-danger disabled:opacity-40"
                          >
                            Unpublish
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={publishMutation.isPending}
                              onClick={() => publishMutation.mutate(p.id)}
                              className="rounded-md border border-accent/40 px-2.5 py-1 text-xs text-accent disabled:opacity-40"
                            >
                              Publish
                            </button>
                            <button
                              type="button"
                              disabled={submitReviewMutation.isPending}
                              onClick={() => submitReviewMutation.mutate(p.id)}
                              className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                            >
                              Submit for Review
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.programs.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-text-dim">
                      No programs match these filters.
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
