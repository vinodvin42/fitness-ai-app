import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminExerciseDirectoryResponse, AdminExerciseListItem } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { useCan } from "../../lib/permissions";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import {
  EMPTY_EXERCISE_VIDEO_FIELDS,
  exerciseVideoFromForm,
  fieldsFromExerciseVideo,
  LICENCE_URLS,
  VIDEO_ASPECTS,
  VIDEO_LICENCES,
  type ExerciseVideoFields,
} from "../../lib/exerciseVideoForm";
import { PROGRAMS_SUB_NAV } from "./subNav";

type Difficulty = "beginner" | "intermediate" | "advanced";
const DIFFICULTY_OPTIONS: Difficulty[] = ["beginner", "intermediate", "advanced"];
const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

interface Filters {
  muscleGroup: string;
  equipment: string;
  difficulty: Difficulty | "";
  status: "draft" | "published" | "";
  search: string;
}

interface FormState extends ExerciseVideoFields {
  name: string;
  muscleGroup: string;
  equipment: string;
  difficulty: Difficulty;
  mediaUrl: string;
  instructionsText: string;
}

const EMPTY_FORM: FormState = {
  ...EMPTY_EXERCISE_VIDEO_FIELDS,
  name: "",
  muscleGroup: "",
  equipment: "",
  difficulty: "beginner",
  mediaUrl: "",
  instructionsText: "",
};

async function fetchDirectory(filters: Filters): Promise<AdminExerciseDirectoryResponse> {
  const res = await apiClient.get<AdminExerciseDirectoryResponse>("/admin/exercises", {
    params: {
      muscleGroup: filters.muscleGroup || undefined,
      equipment: filters.equipment || undefined,
      difficulty: filters.difficulty || undefined,
      status: filters.status || undefined,
      search: filters.search || undefined,
    },
  });
  return res.data;
}

function formToPayload(form: FormState, video: AdminExerciseListItem["video"] | undefined) {
  return {
    name: form.name,
    muscleGroup: form.muscleGroup,
    equipment: form.equipment,
    difficulty: form.difficulty,
    mediaUrl: form.mediaUrl || undefined,
    instructions: form.instructionsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    // Exercise video — see lib/exerciseVideoForm.ts. undefined (create, no
    // video) is dropped from the JSON; null (edit, link emptied) clears it.
    video,
  };
}

/**
 * 05.02 Exercises (docs/admin/03-screen-inventory.md §05.02), added 22 Aug
 * 2026 — the exercise-library half of the Programs CMS. Every spec'd
 * column and filter is real, including "Programs (usage count)" — a real
 * distinct-program count via `WorkoutExercise.workout.programId`. See
 * apps/api's adminPrograms.service.ts doc comment for the module-wide
 * scoping notes (why 05.04 isn't built, why there's no delete).
 * Instructions are entered one per line in a plain textarea — no rich
 * step-reorder UI, matching this pass's minimal-viable-CMS scope.
 *
 * **25 Aug 2026:** draft rows also get a "Submit for Review" action
 * (05.05, alongside the direct Publish button, doesn't gate it) — see
 * ReviewQueueScreen.tsx.
 */
export function ExercisesDirectoryScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ muscleGroup: "", equipment: "", difficulty: "", status: "", search: "" });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [videoError, setVideoError] = useState<string | null>(null);
  // Hide what this role can't do (the API still checks every call).
  const canCreate = useCan("programs", "create");
  const canEdit = useCan("programs", "edit");
  const canApprove = useCan("programs", "approve");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-exercises", filters],
    queryFn: () => fetchDirectory(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["admin-exercises"] });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setVideoError(null);
  };

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) => apiClient.post("/admin/exercises", payload),
    onSuccess: () => {
      invalidateAll();
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof formToPayload> }) =>
      apiClient.patch(`/admin/exercises/${id}`, payload),
    onSuccess: () => {
      invalidateAll();
      closeForm();
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/exercises/${id}/publish`),
    onSuccess: invalidateAll,
  });

  const unpublishMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/exercises/${id}/unpublish`),
    onSuccess: invalidateAll,
  });

  const submitReviewMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/exercises/${id}/submit-review`),
    onSuccess: invalidateAll,
  });

  function startEdit(ex: AdminExerciseListItem) {
    setEditingId(ex.id);
    setVideoError(null);
    setForm({
      ...fieldsFromExerciseVideo(ex.video),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      mediaUrl: ex.mediaUrl ?? "",
      instructionsText: ex.instructions.join("\n"),
    });
    setShowForm(true);
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setVideoError(null);
    setShowForm((prev) => !prev);
  }

  const savePending = createMutation.isPending || updateMutation.isPending;
  const saveError = createMutation.error ?? updateMutation.error;

  return (
    <AppShell title={t("exercisesDirectory.exercises")} subNav={PROGRAMS_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t("exercisesDirectory.totalExercises")} value={data.counts.total} />
            <StatCard label={t("exercisesDirectory.published")} value={data.counts.published} />
            <StatCard label={t("exercisesDirectory.draft")} value={data.counts.draft} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("exercisesDirectory.muscleGroup")}
            <input
              value={filters.muscleGroup}
              onChange={(e) => setFilter("muscleGroup", e.target.value)}
              placeholder={t("exercisesDirectory.eGChest")}
              className="w-32 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("exercisesDirectory.equipment")}
            <input
              value={filters.equipment}
              onChange={(e) => setFilter("equipment", e.target.value)}
              placeholder={t("exercisesDirectory.eGBarbell")}
              className="w-32 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("exercisesDirectory.difficulty")}
            <select
              value={filters.difficulty}
              onChange={(e) => setFilter("difficulty", e.target.value as Filters["difficulty"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">{t("exercisesDirectory.all")}</option>
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("exercisesDirectory.status")}
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">{t("exercisesDirectory.all")}</option>
              <option value="published">{t("exercisesDirectory.published")}</option>
              <option value="draft">{t("exercisesDirectory.draft")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("exercisesDirectory.search")}
            <input
              type="search"
              placeholder={t("exercisesDirectory.name")}
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-44 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          {canCreate && (
            <button
              type="button"
              onClick={startCreate}
              className="ml-auto rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
            >
              {showForm && !editingId ? "Cancel" : "+ Create Exercise"}
            </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const video = exerciseVideoFromForm(form, editingId !== null);
              if ("error" in video) {
                setVideoError(video.error);
                return;
              }
              setVideoError(null);
              const payload = formToPayload(form, video.video);
              if (editingId) updateMutation.mutate({ id: editingId, payload });
              else createMutation.mutate(payload);
            }}
            className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{editingId ? "Edit Exercise" : "Create Exercise"}</div>
              {editingId && (
                <button type="button" onClick={closeForm} className="text-xs text-text-dim hover:text-text-primary">
                  {t("exercisesDirectory.cancel")}
                </button>
              )}
            </div>
            {!editingId && (
              <p className="text-xs text-text-secondary">
                {t("exercisesDirectory.newExercisesStartAs")}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.name2")}
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.difficulty")}
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value as Difficulty }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.muscleGroup")}
                <input
                  required
                  value={form.muscleGroup}
                  onChange={(e) => setForm((prev) => ({ ...prev, muscleGroup: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.equipment")}
                <input
                  required
                  value={form.equipment}
                  onChange={(e) => setForm((prev) => ({ ...prev, equipment: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              {t("exercisesDirectory.mediaUrlOptional")}
              <input
                type="url"
                value={form.mediaUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, mediaUrl: e.target.value }))}
                placeholder="https://…"
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              {t("exercisesDirectory.instructionsOneStepPer")}
              <textarea
                rows={4}
                value={form.instructionsText}
                onChange={(e) => setForm((prev) => ({ ...prev, instructionsText: e.target.value }))}
                className="rounded-md border border-border-subtle bg-surface-raised p-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <fieldset className="space-y-2 rounded-md border border-border-subtle p-3">
              <legend className="px-1 text-xs font-medium text-text-secondary">{t("exercisesDirectory.videoSection")}</legend>
              <p className="text-xs text-text-dim">{t("exercisesDirectory.videoHelp")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.videoUrl")}
                <input
                  type="url"
                  placeholder="https://…/exercise.mp4"
                  value={form.videoUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, videoUrl: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.videoLengthSec")}
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.videoDurationSec}
                  onChange={(e) => setForm((prev) => ({ ...prev, videoDurationSec: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.videoAspect")}
                <select
                  value={form.videoAspect}
                  onChange={(e) => setForm((prev) => ({ ...prev, videoAspect: e.target.value as FormState["videoAspect"] }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {VIDEO_ASPECTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.videoPosterUrl")}
                <input
                  type="url"
                  placeholder="https://…/poster.jpg"
                  value={form.videoPosterUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, videoPosterUrl: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.creditAuthor")}
                <input
                  value={form.creditAuthor}
                  onChange={(e) => setForm((prev) => ({ ...prev, creditAuthor: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.creditLicence")}
                <select
                  value={form.creditLicence}
                  onChange={(e) => {
                    const licence = e.target.value as FormState["creditLicence"];
                    setForm((prev) => ({
                      ...prev,
                      creditLicence: licence,
                      creditLicenceUrl: LICENCE_URLS[licence] ?? "",
                    }));
                  }}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {VIDEO_LICENCES.map((l) => (
                    <option key={l} value={l}>
                      {l === "Own" ? t("exercisesDirectory.licenceOwn") : l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.creditLicenceUrl")}
                <input
                  type="url"
                  value={form.creditLicenceUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, creditLicenceUrl: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.creditSourceUrl")}
                <input
                  type="url"
                  placeholder="https://wger.de/en/exercise/…"
                  value={form.creditSourceUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, creditSourceUrl: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("exercisesDirectory.creditChanges")}
                <input
                  placeholder="Re-encoded and trimmed, sound removed"
                  value={form.creditChanges}
                  onChange={(e) => setForm((prev) => ({ ...prev, creditChanges: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              {videoError && <p className="text-xs text-danger">{videoError}</p>}
            </fieldset>
            {saveError && (
              <p className="text-xs text-danger">{extractErrorMessage(saveError, "Couldn't save this exercise.")}</p>
            )}
            <button
              type="submit"
              disabled={savePending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {savePending ? "Saving…" : editingId ? "Save Changes" : "Create Exercise"}
            </button>
          </form>
        )}

        {isLoading && <p className="text-sm text-text-secondary">{t("exercisesDirectory.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load exercises.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("exercisesDirectory.retry")}
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
                  <th className="px-4 py-3 font-normal">{t("exercisesDirectory.name2")}</th>
                  <th className="px-4 py-3 font-normal">{t("exercisesDirectory.muscle")}</th>
                  <th className="px-4 py-3 font-normal">{t("exercisesDirectory.equipment")}</th>
                  <th className="px-4 py-3 font-normal">{t("exercisesDirectory.difficulty")}</th>
                  <th className="px-4 py-3 font-normal">{t("exercisesDirectory.media")}</th>
                  <th className="px-4 py-3 font-normal">{t("exercisesDirectory.programs")}</th>
                  <th className="px-4 py-3 font-normal">{t("exercisesDirectory.status")}</th>
                  <th className="px-4 py-3 font-normal">{t("exercisesDirectory.updated")}</th>
                  <th className="px-4 py-3 font-normal">{t("exercisesDirectory.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.exercises.map((ex) => (
                  <tr key={ex.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 font-medium text-text-primary">{ex.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{ex.muscleGroup}</td>
                    <td className="px-4 py-3 text-text-secondary">{ex.equipment}</td>
                    <td className="px-4 py-3 text-text-secondary">{DIFFICULTY_LABELS[ex.difficulty]}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {ex.mediaUrl ? "Yes" : "—"}
                      {ex.video && (
                        <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">
                          {t("exercisesDirectory.videoBadge")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{ex.programUsageCount}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ex.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(ex.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => startEdit(ex)}
                            className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                          >
                            {t("exercisesDirectory.edit")}
                          </button>
                        )}
                        {ex.status === "published" ? (
                          canApprove && (
                            <button
                              type="button"
                              disabled={unpublishMutation.isPending}
                              onClick={() => unpublishMutation.mutate(ex.id)}
                              className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-danger hover:text-danger disabled:opacity-40"
                            >
                              {t("exercisesDirectory.unpublish")}
                            </button>
                          )
                        ) : (
                          <>
                            {canApprove && (
                              <button
                                type="button"
                                disabled={publishMutation.isPending}
                                onClick={() => publishMutation.mutate(ex.id)}
                                className="rounded-md border border-accent/40 px-2.5 py-1 text-xs text-accent disabled:opacity-40"
                              >
                                {t("exercisesDirectory.publish")}
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                disabled={submitReviewMutation.isPending}
                                onClick={() => submitReviewMutation.mutate(ex.id)}
                                className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                              >
                                {t("exercisesDirectory.submitForReview")}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.exercises.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-text-dim">
                      {t("exercisesDirectory.noExercisesMatchThese")}
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
