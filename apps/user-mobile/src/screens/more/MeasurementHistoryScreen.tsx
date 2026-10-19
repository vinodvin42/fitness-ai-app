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
import { BodyMap, type BodyMapValue } from "../../components/BodyMap";
import { MeasurementPartSheet } from "../../components/MeasurementPartSheet";
import { HowToMeasureSheet } from "../../components/HowToMeasureSheet";
import { SegmentedControl } from "../../components/SegmentedControl";
import { fetchOnboardingProfile } from "../../api/users";
import { BACK_SPOTS, FRONT_SPOTS, MEASUREMENT_PARTS, pickPart, type MeasurementPartKey } from "../../lib/measurementParts";
import { fetchMeasurements } from "../../api/progress";
import { useMeasureUnits } from "../../lib/measureUnits";
import { FieldPick, fieldChange, pickArms, pickCalves, pickThighs, signed } from "../../lib/measurementFields";
import { useTheme } from "../../theme/ThemeProvider";
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
 * Body Measurements (Figma Progress 03, and 06b measure-01/02/03/06): a
 * front/back body map with the latest value and last change per part (tap a
 * part for its history), a link to Compare dates, a "Measurements History" list (latest value + the
 * change versus the previous logged value of that region), and a Progress
 * Summary. Nothing is estimated: a region you have never measured shows "-"
 * on the figure and is left out of the list.
 */
export function MeasurementHistoryScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const { width } = useWindowDimensions();
  const { colors: theme } = useTheme();
  const [showEntries, setShowEntries] = useState(false);
  const [view, setView] = useState<"front" | "back">("front");
  const [openPart, setOpenPart] = useState<MeasurementPartKey | null>(null);
  const [howTo, setHowTo] = useState<{ focus: MeasurementPartKey | null } | null>(null);
  const { data: profile } = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile, staleTime: 60_000 });
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });

  const rows = data ?? [];
  const mapW = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.sm * 2;

  const latestRow = rows.reduce<BodyMeasurement | null>((a, r) => (!a || r.loggedAt > a.loggedAt ? r : a), null);
  const mapValues: Partial<Record<MeasurementPartKey, BodyMapValue>> = {};
  for (const key of Object.keys(MEASUREMENT_PARTS) as MeasurementPartKey[]) {
    const c = fieldChange(rows, pickPart(key));
    if (!c.latest) continue;
    const d = c.delta == null ? null : Math.round((units.len(c.latest.value) - units.len(c.previous!.value)) * 10) / 10;
    mapValues[key] = {
      value: `${units.len(c.latest.value)} ${units.lenUnit}`,
      change: d == null ? null : d === 0 ? "—" : `${d < 0 ? "↓" : "↑"}${Math.abs(d).toFixed(1)}`,
    };
  }
  // Opening one sheet from another: let the first close before the second slides up.
  const showHowTo = (focus: MeasurementPartKey | null) => {
    if (openPart === null) {
      setHowTo({ focus });
      return;
    }
    setOpenPart(null);
    setTimeout(() => setHowTo({ focus }), 350);
  };

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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
            <View style={{ width: 160 }}>
              <SegmentedControl
                options={[
                  { value: "front", label: "Front" },
                  { value: "back", label: "Back" },
                ]}
                value={view}
                onChange={setView}
              />
            </View>
            {rows.length >= 2 ? (
              <Pressable
                onPress={() => navigation.navigate("MeasurementCompare")}
                accessibilityRole="button"
                accessibilityLabel="Compare two dates"
                style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7 }}
              >
                <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 13 }}>Compare dates</Text>
              </Pressable>
            ) : null}
          </View>
          <Card style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.sm }}>
            <BodyMap width={mapW} spots={view === "front" ? FRONT_SPOTS : BACK_SPOTS} values={mapValues} onSelect={setOpenPart} />
          </Card>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            Tap a part to see its history.{" "}
            <Text onPress={() => showHowTo(null)} accessibilityRole="link" style={{ color: theme.accentText, fontFamily: fonts.bodySemi }}>
              How to measure
            </Text>
          </Text>

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
                        color: colors.accentText,
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
            <Text style={{ color: colors.accentText, ...typography.label }}>{showEntries ? "Hide entries" : `Show all ${rows.length} entries`}</Text>
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
      <MeasurementPartSheet
        part={openPart}
        rows={rows}
        heightCm={profile?.heightCm ?? null}
        onHowTo={(k) => showHowTo(k)}
        onClose={() => setOpenPart(null)}
      />
      <HowToMeasureSheet visible={howTo !== null} focus={howTo?.focus ?? null} onClose={() => setHowTo(null)} />
    </ScreenContainer>
  );
}
