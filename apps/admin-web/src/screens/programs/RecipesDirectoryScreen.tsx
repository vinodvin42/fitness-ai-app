import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminRecipeDirectoryResponse, AdminRecipeListItem } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { PROGRAMS_SUB_NAV } from "./subNav";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
const MEAL_TYPE_OPTIONS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

interface Filters {
  mealType: MealType | "";
  status: "draft" | "published" | "";
  search: string;
}

interface FormState {
  name: string;
  mealType: MealType;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  prepTimeMinutes: string;
  tagsText: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  mealType: "breakfast",
  calories: "",
  proteinG: "0",
  carbsG: "0",
  fatG: "0",
  prepTimeMinutes: "",
  tagsText: "",
};

async function fetchDirectory(filters: Filters): Promise<AdminRecipeDirectoryResponse> {
  const res = await apiClient.get<AdminRecipeDirectoryResponse>("/admin/recipes", {
    params: {
      mealType: filters.mealType || undefined,
      status: filters.status || undefined,
      search: filters.search || undefined,
    },
  });
  return res.data;
}

function formToPayload(form: FormState) {
  return {
    name: form.name,
    mealType: form.mealType,
    calories: Number(form.calories),
    proteinG: Number(form.proteinG || "0"),
    carbsG: Number(form.carbsG || "0"),
    fatG: Number(form.fatG || "0"),
    prepTimeMinutes: Number(form.prepTimeMinutes),
    tags: form.tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

/**
 * 05.03 Recipes (docs/admin/03-screen-inventory.md §05.03), added 22 Aug
 * 2026 — the recipe-library half of the Programs CMS. Most spec'd columns
 * are real; two are honestly not:
 * - **"Programs (usage)"** has no real backing relation at all — `Recipe`
 *   only connects to `MealLog`, never to `Program`. `timesLogged` (a real
 *   count of `MealLog` rows referencing this recipe) is shown instead as a
 *   genuine usage substitute — see apps/api's adminPrograms.service.ts.
 * - **"Rating"**, and the **Diet type** and **Cuisine** filters, have no
 *   backing entity/field at all — rendered via `NotAvailablePanel` rather
 *   than faked.
 *
 * **25 Aug 2026:** draft rows also get a "Submit for Review" action
 * (05.05, alongside the direct Publish button, doesn't gate it) — see
 * ReviewQueueScreen.tsx.
 */
export function RecipesDirectoryScreen() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ mealType: "", status: "", search: "" });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-recipes", filters],
    queryFn: () => fetchDirectory(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["admin-recipes"] });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) => apiClient.post("/admin/recipes", payload),
    onSuccess: () => {
      invalidateAll();
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof formToPayload> }) =>
      apiClient.patch(`/admin/recipes/${id}`, payload),
    onSuccess: () => {
      invalidateAll();
      closeForm();
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/recipes/${id}/publish`),
    onSuccess: invalidateAll,
  });

  const unpublishMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/recipes/${id}/unpublish`),
    onSuccess: invalidateAll,
  });

  const submitReviewMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/recipes/${id}/submit-review`),
    onSuccess: invalidateAll,
  });

  function startEdit(r: AdminRecipeListItem) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      mealType: r.mealType,
      calories: String(r.calories),
      proteinG: String(r.proteinG),
      carbsG: String(r.carbsG),
      fatG: String(r.fatG),
      prepTimeMinutes: String(r.prepTimeMinutes),
      tagsText: r.tags.join(", "),
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
    <AppShell title="Recipes" subNav={PROGRAMS_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total Recipes" value={data.counts.total} />
            <StatCard label="Published" value={data.counts.published} />
            <StatCard label="Draft" value={data.counts.draft} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Meal type
            <select
              value={filters.mealType}
              onChange={(e) => setFilter("mealType", e.target.value as Filters["mealType"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              {MEAL_TYPE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {MEAL_TYPE_LABELS[m]}
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
            Search
            <input
              type="search"
              placeholder="Name or tag…"
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
            {showForm && !editingId ? "Cancel" : "+ Create Recipe"}
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
              <div className="text-sm font-medium">{editingId ? "Edit Recipe" : "Create Recipe"}</div>
              {editingId && (
                <button type="button" onClick={closeForm} className="text-xs text-text-dim hover:text-text-primary">
                  Cancel
                </button>
              )}
            </div>
            {!editingId && (
              <p className="text-xs text-text-secondary">
                New recipes start as a Draft — not visible to consumers until you Publish them.
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
                Meal type
                <select
                  value={form.mealType}
                  onChange={(e) => setForm((prev) => ({ ...prev, mealType: e.target.value as MealType }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {MEAL_TYPE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {MEAL_TYPE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Calories
                <input
                  required
                  type="number"
                  min={0}
                  value={form.calories}
                  onChange={(e) => setForm((prev) => ({ ...prev, calories: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Protein (g)
                <input
                  type="number"
                  min={0}
                  value={form.proteinG}
                  onChange={(e) => setForm((prev) => ({ ...prev, proteinG: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Carbs (g)
                <input
                  type="number"
                  min={0}
                  value={form.carbsG}
                  onChange={(e) => setForm((prev) => ({ ...prev, carbsG: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Fat (g)
                <input
                  type="number"
                  min={0}
                  value={form.fatG}
                  onChange={(e) => setForm((prev) => ({ ...prev, fatG: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Prep time (min)
                <input
                  required
                  type="number"
                  min={0}
                  value={form.prepTimeMinutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, prepTimeMinutes: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Tags (comma-separated)
              <input
                value={form.tagsText}
                onChange={(e) => setForm((prev) => ({ ...prev, tagsText: e.target.value }))}
                placeholder="high-protein, quick, vegetarian"
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            {saveError && (
              <p className="text-xs text-danger">{extractErrorMessage(saveError, "Couldn't save this recipe.")}</p>
            )}
            <button
              type="submit"
              disabled={savePending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {savePending ? "Saving…" : editingId ? "Save Changes" : "Create Recipe"}
            </button>
          </form>
        )}

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load recipes.")}
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
                  <th className="px-4 py-3 font-normal">Name</th>
                  <th className="px-4 py-3 font-normal">Meal Type</th>
                  <th className="px-4 py-3 font-normal">Calories</th>
                  <th className="px-4 py-3 font-normal">Prep Time</th>
                  <th className="px-4 py-3 font-normal">Tags</th>
                  <th className="px-4 py-3 font-normal">Times Logged</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Updated</th>
                  <th className="px-4 py-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.recipes.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 font-medium text-text-primary">{r.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{MEAL_TYPE_LABELS[r.mealType]}</td>
                    <td className="px-4 py-3 text-text-secondary">{r.calories}</td>
                    <td className="px-4 py-3 text-text-secondary">{r.prepTimeMinutes}m</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-text-secondary">
                            {t}
                          </span>
                        ))}
                        {r.tags.length > 3 && <span className="text-[10px] text-text-dim">+{r.tags.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{r.timesLogged}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(r.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                        >
                          Edit
                        </button>
                        {r.status === "published" ? (
                          <button
                            type="button"
                            disabled={unpublishMutation.isPending}
                            onClick={() => unpublishMutation.mutate(r.id)}
                            className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-danger hover:text-danger disabled:opacity-40"
                          >
                            Unpublish
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={publishMutation.isPending}
                              onClick={() => publishMutation.mutate(r.id)}
                              className="rounded-md border border-accent/40 px-2.5 py-1 text-xs text-accent disabled:opacity-40"
                            >
                              Publish
                            </button>
                            <button
                              type="button"
                              disabled={submitReviewMutation.isPending}
                              onClick={() => submitReviewMutation.mutate(r.id)}
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
                {data.recipes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-text-dim">
                      No recipes match these filters.
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
            subtitle="No backing field exists yet for these Figma-spec'd columns/filters — see adminPrograms.service.ts."
          />
        )}
      </div>
    </AppShell>
  );
}
