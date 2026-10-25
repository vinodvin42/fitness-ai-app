import React from "react";
import { Pressable, Text, View } from "react-native";
import type { ExerciseSetLog } from "@fitness-ai-app/types";
import { Icon } from "./Icon";
import { formatSetValues, formatWeight, setRowLabels } from "../lib/fastLogging";
import { formatMmSs } from "../lib/format";
import { setLogsFor } from "../lib/setNumbering";
import { groupMembers, supersetLabel } from "../lib/supersets";
import type { SessionExerciseView } from "../lib/sessionExerciseList";
import { colors, elevation, fonts, radius, spacing, themed } from "../theme/tokens";
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
  const { colors: theme, scheme } = useTheme();
  const doneCheckColor = scheme === "dark" ? colors.background : "#ffffff";
  // Figma log/03: the active exercise's superset partners come first, right under it.
  const activeGroup = exercises[activeIndex]?.supersetGroup ?? null;
  const isPartner = (ex: SessionExerciseView) => !!activeGroup && ex.supersetGroup === activeGroup;
  const others = exercises.map((ex, index) => ({ ex, index })).filter(({ index }) => index !== activeIndex);
  const rows = [...others.filter(({ ex }) => isPartner(ex)), ...others.filter(({ ex }) => !isPartner(ex))];
  if (rows.length === 0) return null;

  return (
    <>
      <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18, lineHeight: 24, marginTop: spacing.xs }}>
        This workout
      </Text>
      {rows.map(({ ex, index }) => {
        const logged = setLogsFor(setLogs, ex.exercise.id);
        const labels = setRowLabels(logged.map((l) => ({ isWarmup: l.isWarmup, isDropSet: l.isDropSet, isFailure: !!l.isFailure })));
        const working = logged.filter((l) => !l.isWarmup && !l.isDropSet && !l.isFailure).length;
        const previous = setLogsFor(previousLogs, ex.exercise.id).filter((l) => !l.isWarmup && !l.isDropSet && !l.isFailure);
        const planned = Math.max(0, ex.targetSets - working);
        const done = working >= ex.targetSets;
        const status = done
          ? `Done · ${working} set${working === 1 ? "" : "s"}`
          : isPartner(ex)
            ? index > activeIndex
              ? "Up next"
              : "Next round"
            : index < activeIndex
              ? "Skipped so far"
              : index === activeIndex + 1
                ? "Up next"
                : "Later";
        // Figma log/03: a superset partner keeps its A2 label, purple outline and bar.
        const label = supersetLabel(exercises, index);
        const grouped = !!ex.supersetGroup && groupMembers(exercises, index).length > 1;
        return (
          <View key={ex.id} style={{ flexDirection: "row", gap: spacing.sm }}>
            {grouped ? <View style={{ width: 4, borderRadius: 2, backgroundColor: colors.aiAccent }} /> : null}
            <View
              style={{
                flex: 1,
                backgroundColor: colors.surface,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: grouped ? colors.aiAccent : colors.border,
                padding: spacing.md,
                gap: 6,
                ...elevation.card,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={{ flex: 1, color: theme.accentText, fontFamily: fonts.displayBold, fontSize: 17 }}>
                  {grouped && label ? `${label} · ` : ""}
                  {ex.exercise.name}
                </Text>
                <Text style={{ color: done ? colors.successText : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{status}</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                Rest {formatMmSs(ex.restSeconds ?? defaultRest)} · {ex.targetSets} × {ex.targetReps}
              </Text>

              <View style={[sheet.row, { minHeight: 28, marginTop: 4 }]}>
                <Text style={[sheet.head, sheet.setCol]}>SET</Text>
                <Text style={[sheet.head, sheet.prevCol]}>PREVIOUS</Text>
                <Text style={[sheet.head, sheet.numCol]}>KG</Text>
                <Text style={[sheet.head, sheet.numCol]}>REPS</Text>
                <Text style={[sheet.head, sheet.checkCol]}>✓</Text>
              </View>
              {logged.map((l, i) => (
                <View key={l.id} style={[sheet.row, { borderRadius: radius.sm, backgroundColor: l.pending ? colors.warningSoft : colors.successSoft }]}>
                  <Text style={[sheet.label, sheet.setCol, labels[i] === "W" ? { color: colors.warningText } : null]}>{labels[i]}</Text>
                  <Text style={[sheet.prev, sheet.prevCol]} numberOfLines={1}>
                    {formatSetValues(previous[i] ? { weightKg: previous[i].weightKg, reps: previous[i].reps } : undefined)}
                  </Text>
                  <Text style={[sheet.value, sheet.numCol]}>{l.weightKg != null ? formatWeight(l.weightKg) : "—"}</Text>
                  <Text style={[sheet.value, sheet.numCol]}>{l.reps}</Text>
                  <View style={[sheet.checkCol, { alignItems: "center" }]} accessible accessibilityLabel={l.pending ? "Waiting to sync" : "Logged"}>
                    {l.pending ? (
                      <Icon name="cloud-off" size={15} color={colors.warningText} />
                    ) : (
                      <View style={sheet.doneCheck}>
                        <Icon name="check" size={15} color={doneCheckColor} strokeWidth={3} />
                      </View>
                    )}
                  </View>
                </View>
              ))}
              {Array.from({ length: planned }, (_, i) => {
                const n = working + i + 1;
                const p = previous[n - 1];
                return (
                  <View key={`plan-${n}`} style={sheet.row}>
                    <Text style={[sheet.label, sheet.setCol, { color: colors.textSecondary }]}>{n}</Text>
                    <Text style={[sheet.prev, sheet.prevCol]} numberOfLines={1}>
                      {formatSetValues(p ? { weightKg: p.weightKg, reps: p.reps } : undefined)}
                    </Text>
                    <View style={[sheet.cell, sheet.numCol]}>
                      <Text style={sheet.planned}>{p?.weightKg != null ? formatWeight(p.weightKg) : "—"}</Text>
                    </View>
                    <View style={[sheet.cell, sheet.numCol]}>
                      <Text style={sheet.planned}>{p?.reps ?? ex.targetReps}</Text>
                    </View>
                    <View style={[sheet.cell, sheet.checkCol]}>
                      <Icon name="check" size={15} color={colors.textMuted} strokeWidth={3} />
                    </View>
                  </View>
                );
              })}

              {!done ? (
                <Pressable
                  onPress={() => onJump(index)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Log ${ex.exercise.name} now`}
                  style={({ pressed }) => ({
                    height: 40,
                    marginTop: 4,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceRaised,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
                  })}
                >
                  <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>Log this exercise now</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </>
  );
}

/** The same set-table columns as the active card (ActiveWorkoutScreen tableStyles), read-only here. */
const sheet = themed(() => ({
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36 },
  head: { color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.3 },
  setCol: { width: 34, textAlign: "center" },
  prevCol: { flex: 1 },
  numCol: { width: 62, textAlign: "center" },
  checkCol: { width: 36, textAlign: "center" },
  label: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14, textAlign: "center" },
  prev: { color: colors.textSecondary, fontSize: 13 },
  value: { color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14, textAlign: "center" },
  planned: { color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 14, textAlign: "center" },
  cell: { height: 32, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, alignItems: "center", justifyContent: "center" },
  doneCheck: { width: 36, height: 30, borderRadius: radius.sm, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
} as const));
