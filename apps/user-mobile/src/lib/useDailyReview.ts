import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReadiness } from "../api/recovery";
import { fetchNextWorkout } from "../api/plans";
import { fetchWorkoutHistory, fetchWorkoutSession } from "../api/workoutSessions";
import { fetchCurrentRecommendation } from "../api/recommendations";
import { useWorkoutSettings } from "../api/workoutSettings";
import { GUIDED_ROUTINES, routineSeconds } from "../content/recover";
import { averageRpe, computeDailySuggestions, type DailySuggestion } from "./dailySuggestions";
import { useDailyReviewStore } from "./dailyReviewStore";

/** The gentle routine "Go lighter today" offers (the one Today's optional mobility row used). */
export const LIGHTER_ROUTINE_ID = "shoulder-hamstring-mobility";
const LOOKBACK_MS = 48 * 60 * 60 * 1000;

const sameDay = (iso: string, now: Date) => new Date(iso).toDateString() === now.toDateString();

/**
 * Today's daily-review suggestions from data the app already loads (same query
 * keys as Today, so no extra requests beyond the last session's set log and
 * the current recommendation). `ready` stays false until everything that
 * could add a suggestion has loaded, so the Today card never appears and then
 * changes.
 */
export function useDailyReview(): { ready: boolean; suggestions: DailySuggestion[] } {
  const store = useDailyReviewStore();
  const now = new Date();
  const enabled = store.ready && store.mode !== "off";

  const history = useQuery({ queryKey: ["workoutHistory"], queryFn: fetchWorkoutHistory, enabled });
  const next = useQuery({ queryKey: ["plans", "current", "nextWorkout"], queryFn: fetchNextWorkout, enabled });
  const readiness = useQuery({ queryKey: ["readiness"], queryFn: fetchReadiness, enabled });
  const recommendation = useQuery({ queryKey: ["recommendations", "current"], queryFn: fetchCurrentRecommendation, enabled, retry: false });
  const { data: settings, isLoading: settingsLoading } = useWorkoutSettings();

  const lastCompleted = useMemo(
    () =>
      (history.data ?? [])
        .filter((h) => h.status === "completed" && h.completedAt)
        .sort((a, b) => (b.completedAt as string).localeCompare(a.completedAt as string))[0],
    [history.data],
  );
  const recent = !!lastCompleted && Date.now() - new Date(lastCompleted.completedAt as string).getTime() <= LOOKBACK_MS;
  const lastSession = useQuery({
    queryKey: ["workoutSession", lastCompleted?.id],
    queryFn: () => fetchWorkoutSession(lastCompleted!.id),
    enabled: enabled && recent,
  });

  const routine = GUIDED_ROUTINES.find((r) => r.id === LIGHTER_ROUTINE_ID);
  const routineLabel = routine ? `${routine.title} · ${Math.max(1, Math.round(routineSeconds(routine) / 60))} min` : "Gentle mobility";

  const loaded =
    store.ready &&
    (store.mode === "off" ||
      (!history.isLoading && !next.isLoading && !readiness.isLoading && !recommendation.isLoading && !settingsLoading && (!recent || !lastSession.isLoading)));

  const suggestions = loaded
    ? computeDailySuggestions({
        now,
        mode: store.mode,
        decisions: store.decisions,
        trainingDays: settings?.trainingDays ?? [],
        nextWorkoutName: next.data?.workout?.name ?? null,
        trainedToday: (history.data ?? []).some(
          (h) => (h.status === "in_progress" && sameDay(h.startedAt, now)) || (h.status === "completed" && !!h.completedAt && sameDay(h.completedAt, now)),
        ),
        lastCompleted:
          lastCompleted && recent
            ? {
                completedAt: lastCompleted.completedAt as string,
                workoutName: lastCompleted.workoutName,
                avgRpe: lastSession.data ? averageRpe(lastSession.data.setLogs) : null,
              }
            : null,
        readiness: readiness.data ? { band: readiness.data.band, score: readiness.data.score } : null,
        recommendation: recommendation.data ?? null,
        lighterRoutineLabel: routineLabel,
        lightWeek: {
          enabled: settings?.autoDeloadWeek ?? false,
          sessions: (history.data ?? [])
            .filter((h) => h.status === "completed" && h.completedAt)
            .map((h) => ({ completedAt: h.completedAt as string, feel: h.feel ?? null })),
        },
      })
    : [];

  return { ready: loaded, suggestions };
}
