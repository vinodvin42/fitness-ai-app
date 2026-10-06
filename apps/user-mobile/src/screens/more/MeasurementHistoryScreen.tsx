import React, { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BodyMeasurement } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonCard } from "../../components/Skeleton";
import { BodySilhouette, Callout } from "../../components/ProgressCharts";
import { fetchMeasurements } from "../../api/progress";
import { useMeasureUnits } from "../../lib/measureUnits";
import { FieldPick, fieldChange, pickArms, pickCalves, pickThighs, signed } from "../../lib/measurementFields";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "MeasurementHistory">;

interface RowDef {
  label: string;
  pick: FieldPick;
  /** When set, the row shows "left / right" instead of the mean. */
  pair?: [keyof BodyMeasurement, keyof BodyMeasurement];
}

const ROWS: RowDef[] = [
  { label: "Neck", pick: (m) => m.neckCm },
  { label: "Chest", pick: (m) => m.chestCm },
  { label: "Shoulders", pick: (m) => m.shouldersCm },
  { label: "Biceps (L/R)", pick: pickArms, pair: ["bicepLeftCm", "bicepRightCm"] },
  { label: "Waist", pick: (m) => m.waistCm },
  { label: "Hips", pick: (m) => m.hipsCm },
  { label: "Thighs (L/R)", pick: pickThighs, pair: ["thighLeftCm", "thighRightCm"] },
  { label: "Calves (L/R)", pick: pickCalves, pair: ["calfLeftCm", "calfRightCm"] },
];

/**
 * Body Measurements (Figma Progress 03): a silhouette with the latest value
 * called out per region, a "Measurements History" list (latest value + the
 * change versus the previous logged value of that region), and a Progress
 * Summary. Nothing is estimated: a region you have never measured shows "-"
 * on the figure and is left out of the list.
 */
export function MeasurementHistoryScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const { width } = useWindowDimensions();
  const [showEntries, setShowEntries] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });

  const rows = data ?? [];
  const figW = Math.min(Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.md * 2, 230);
  const L = (cm: number | undefined | null) => (cm == null ? null : `${units.len(cm)} ${units.lenUnit}`);

  const latestRow = rows.reduce<BodyMeasurement | null>((a, r) => (!a || r.loggedAt > a.loggedAt ? r : a), null);
  const ch = (pick: FieldPick) => fieldChange(rows, pick).latest?.value;

  const callouts: Callout[] = [
    { side: "left", ax: 100, ay: 90, label: "Shoulders", value: L(ch((m) => m.shouldersCm)) },
    { side: "right", ax: 192, ay: 118, label: "Chest", value: L(ch((m) => m.chestCm)) },
    { side: "right", ax: 213, ay: 156, label: "Biceps", value: L(ch(pickArms)) },
    { side: "left", ax: 118, ay: 194, label: "Waist", value: L(ch((m) => m.waistCm)) },
    { side: "right", ax: 190, ay: 232, label: "Hips", value: L(ch((m) => m.hipsCm)) },
    { side: "left", ax: 128, ay: 290, label: "Thighs", value: L(ch(pickThighs)) },
  ];

  // Progress summary: waist + hips, first vs latest logged value of each.
  const waist = fieldChange(rows, (m) => m.waistCm);
  const hips = fieldChange(rows, (m) => m.hipsCm);
  const parts = [waist, hips].filter((c) => c.latest && c.first && c.latest.at !== c.first.at);
  const totalDelta = parts.reduce((s, c) => s + (c.first!.value - c.latest!.value), 0);
  const partLabel = [waist, hips]
    .map((c, i) => (c.latest && c.first && c.latest.at !== c.first.at ? (i === 0 ? "waist" : "hips") : null))
    .filter(Boolean)
    .join(" + ");

  return (
    <ScreenContainer
      title="Body Measurements"
      subtitle={latestRow ? `Updated ${new Date(latestRow.loggedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : undefined}
      right={
        <Pressable
          onPress={() => navigation.navigate("LogMeasurement")}
          accessibilityRole="button"
          accessibilityLabel="Log new measurements"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceHigh, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="plus" size={18} color={colors.textPrimary} />
        </Pressable>
      }
    >
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <SkeletonCard lines={4} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No measurements logged yet"
          subtitle="Log your body measurements to see them on the figure and track changes."
          actionLabel="Log New Measurements"
          onAction={() => navigation.navigate("LogMeasurement")}
        />
      ) : (
        <>
          <Card style={{ alignItems: "center", paddingVertical: spacing.md }}>
            <BodySilhouette width={figW} callouts={callouts} />
          </Card>

          <Text style={{ color: colors.textSecondary, ...typography.label }}>Measurements History</Text>
          <View style={{ gap: spacing.sm }}>
            {ROWS.map((r) => {
              const c = fieldChange(rows, r.pick);
              if (!c.latest) return null;
              const latest = rows.find((m) => m.loggedAt === c.latest!.at)!;
              const pair = r.pair ? [latest[r.pair[0]], latest[r.pair[1]]] : null;
              const text =
                pair && typeof pair[0] === "number" && typeof pair[1] === "number"
                  ? `${units.len(pair[0])} / ${units.len(pair[1] as number)}`
                  : String(units.len(c.latest.value));
              return (
                <View
                  key={r.label}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    backgroundColor: colors.surface,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: spacing.md,
                    minHeight: 44,
                  }}
                >
                  <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: colors.accent }} />
                  <Text style={{ color: colors.textPrimary, flex: 1, ...typography.body, fontSize: 14 }}>{r.label}</Text>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>
                    {text} {units.lenUnit}
                  </Text>
                  {c.delta != null ? (
                    <Text
                      style={{
                        color: colors.accent,
                        ...typography.caption,
                        backgroundColor: colors.accentSoft,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      {c.delta === 0 ? "no change" : `${signed(units.len(Math.abs(c.delta)) * Math.sign(c.delta))} ${units.lenUnit}`}
                    </Text>
                  ) : (
                    <Text style={{ color: colors.textMuted, ...typography.caption }}>first log</Text>
                  )}
                </View>
              );
            })}
          </View>

          <Card style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Icon name="sparkles" size={16} color={colors.aiAccent} />
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Progress Summary</Text>
            </View>
            {parts.length > 0 ? (
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                {totalDelta >= 0 ? "Total lost" : "Total gained"}: {units.len(Math.abs(totalDelta))} {units.lenUnit} ({partLabel}) since your first log
              </Text>
            ) : (
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>Log waist and hips again to see how they change.</Text>
            )}
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Circumference changes are not proof of muscle gain.</Text>
          </Card>

          <Button label="Log New Measurements" onPress={() => navigation.navigate("LogMeasurement")} />

          <Pressable onPress={() => setShowEntries((v) => !v)} accessibilityRole="button" style={{ alignSelf: "center", padding: spacing.sm }}>
            <Text style={{ color: colors.accent, ...typography.label }}>{showEntries ? "Hide entries" : `Show all ${rows.length} entries`}</Text>
          </Pressable>
          {showEntries
            ? rows.map((m) => (
                <Card key={m.id} style={{ gap: 2, padding: spacing.sm }}>
                  <Text style={{ color: colors.textPrimary, ...typography.label }}>
                    {new Date(m.loggedAt).toLocaleDateString()}
                    {m.source === "device" ? `  ·  ${m.deviceName ?? "Smart scale"}` : ""}
                  </Text>
                  <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                    {[
                      m.weightKg != null ? `Weight ${units.wt(m.weightKg)} ${units.wtUnit}` : null,
                      m.bodyFatPercent != null ? `Body fat ${m.bodyFatPercent}%` : null,
                      m.waistCm != null ? `Waist ${units.len(m.waistCm)} ${units.lenUnit}` : null,
                      m.chestCm != null ? `Chest ${units.len(m.chestCm)} ${units.lenUnit}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Tape measurements only"}
                  </Text>
                </Card>
              ))
            : null}
        </>
      )}
    </ScreenContainer>
  );
}
