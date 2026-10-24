import React from "react";
import { Pressable, Text, View } from "react-native";
import type { ExerciseSetLog } from "@fitness-ai-app/types";
import { Icon } from "./Icon";
import { formatSetValues, formatWeight, setRowLabels } from "../lib/fastLogging";
import { formatMmSs } from "../lib/format";
import { setLogsFor } from "../lib/setNumbering";
import type { SessionExerciseView } from "../lib/sessionExerciseList";
import { colors, fonts, radius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

type Log = Pick<ExerciseSetLog, "id" | "exerciseId" | "setNumber" | "reps" | "weightKg" | "isWarmup" | "isDropSet"> & {
  isFailure?: boolean | null;
  /** Saved on this phone, waiting to sync (lib/offlineSets.ts). */
  pending?: boolean;
};

/**
 * Figma log/01 "every exercise on one sheet" (24 Oct 2026): below the active
 * exercise, each other exercise of the workout with its own set table — sets
 * already logged (✓), then the planned sets with last time's numbers. "Log
 * this now" makes it the active exercise, so exercises can be logged in any
 * order; the logging itself stays in the active card above (one place that
 * numbers sets, starts the rest timer and keeps supersets in order).
 */
export function WorkoutSheetList({
  exercises,
  activeIndex,
  setLogs,
  previousLogs,
  defaultRest,
  disabled,
  onJump,
}: {
  exercises: readonly SessionExerciseView[];
  activeIndex: number;
  setLogs: readonly Log[];
  previousLogs: readonly Log[];
  defaultRest: number;
  disabled: boolean;
  onJump: (index: number) => void;
}) {
  const { colors: theme } = useTheme();
  const rows = exercises.map((ex, index) => ({ ex, index })).filter(({ index }) => index !== activeIndex);
  if (rows.length === 0) return null;

  return (
    <>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 14 }}>This workout</Text>
      {rows.map(({ ex, index }) => {
        const logged = setLogsFor(setLogs, ex.exercise.id);
        const labels = setRowLabels(logged.map((l) => ({ isWarmup: l.isWarmup, isDropSet: l.isDropSet, isFailure: !!l.isFailure })));
        const working = logged.filter((l) => !l.isWarmup && !l.isDropSet && !l.isFailure).length;
        const previous = setLogsFor(previousLogs, ex.exercise.id).filter((l) => !l.isWarmup && !l.isDropSet && !l.isFailure);
        const planned = Math.max(0, ex.targetSets - working);
        const done = working >= ex.targetSets;
        const status = done ? `Done · ${working} set${working === 1 ? "" : "s"}` : index < activeIndex ? "Skipped so far" : index === activeIndex + 1 ? "Up next" : "Later";
        return (
          <View
            key={ex.id}
            style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm + 2, gap: 6 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{ex.exercise.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                  Rest {formatMmSs(ex.restSeconds ?? defaultRest)} · {ex.targetSets} × {ex.targetReps}
                </Text>
              </View>
              <Text style={{ color: done ? colors.successText : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{status}</Text>
            </View>

            {logged.map((l, i) => (
              <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 }}>
                <Text style={{ width: 30, textAlign: "center", color: labels[i] === "W" ? colors.warningText : colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>
                  {labels[i]}
                </Text>
                <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 14 }}>
                  {l.weightKg != null ? `${formatWeight(l.weightKg)} kg × ${l.reps}` : `${l.reps} reps`}
                </Text>
                {l.pending ? (
                  <View accessible accessibilityLabel="Waiting to sync">
                    <Icon name="cloud-off" size={15} color={colors.warningText} />
                  </View>
                ) : (
                  <Icon name="check" size={16} color={colors.successText} strokeWidth={3} />
                )}
              </View>
            ))}
            {Array.from({ length: planned }, (_, i) => {
              const n = working + i + 1;
              const p = previous[n - 1];
              return (
                <View key={`plan-${n}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 }}>
                  <Text style={{ width: 30, textAlign: "center", color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 14 }}>{n}</Text>
                  <Text style={{ flex: 1, color: colors.textMuted, fontSize: 14 }}>
                    {p ? `Last time ${formatSetValues({ weightKg: p.weightKg, reps: p.reps })}` : `${ex.targetReps} rep${ex.targetReps === 1 ? "" : "s"} planned`}
                  </Text>
                </View>
              );
            })}

            {!done ? (
              <Pressable
                onPress={() => onJump(index)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Log ${ex.exercise.name} now`}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 2,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: theme.accent,
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Log this now</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </>
  );
}
