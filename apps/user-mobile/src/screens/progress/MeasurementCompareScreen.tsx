import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BodyMeasurement } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchMeasurements } from "../../api/progress";
import { COMPARE_ROWS, MEASUREMENT_PARTS, rowMean } from "../../lib/measurementParts";
import { useMeasureUnits } from "../../lib/measureUnits";
import { colors, fonts, radius, spacing, themed, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "MeasurementCompare">;

const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * Compare dates (Figma 06b measure-05): every tape measurement from two logged
 * entries side by side, with the change. Defaults to your first and latest
 * entries; "Change dates" picks any two. Parts missing from either entry show
 * "—" and no change.
 */
export function MeasurementCompareScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const { colors: theme } = useTheme();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });
  const entries = [...(data ?? [])].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);

  const from = entries.find((e) => e.id === fromId) ?? entries[0];
  const to = entries.find((e) => e.id === toId) ?? entries[entries.length - 1];

  const cell = (m: BodyMeasurement, keys: readonly (keyof typeof MEASUREMENT_PARTS)[]) => {
    const vals = keys.map((k) => m[MEASUREMENT_PARTS[k].field]);
    if (vals.every((v) => v == null)) return "—";
    return vals.map((v) => (v == null ? "—" : String(units.len(v)))).join(" / ");
  };

  return (
    <ScreenContainer
      title="Compare dates"
      subtitle={from && to ? `${longDate(from.loggedAt)} vs ${longDate(to.loggedAt)}` : undefined}
    >
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <SkeletonCard lines={6} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : entries.length < 2 || !from || !to ? (
        <EmptyState
          title="Log measurements twice to compare"
          subtitle="Compare shows how each part changed between two logged dates."
          actionLabel="Log New Measurements"
          onAction={() => navigation.navigate("LogMeasurement")}
        />
      ) : (
        <>
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <Pressable
              onPress={() => setPicking("from")}
              accessibilityRole="button"
              accessibilityLabel="Change dates"
              style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7 }}
            >
              <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 13 }}>Change dates</Text>
            </Pressable>
          </View>

          <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
            <View style={[rowStyle, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[headStyle, { flex: 1.3 }]}>Part</Text>
              <Text style={[headStyle, { flex: 1 }]}>{dayMonth(from.loggedAt)}</Text>
              <Text style={[headStyle, { flex: 1 }]}>{dayMonth(to.loggedAt)}</Text>
              <Text style={[headStyle, { width: 56, textAlign: "right" }]}>Change</Text>
            </View>
            {COMPARE_ROWS.filter((r) => rowMean(from, r.keys) != null || rowMean(to, r.keys) != null).map((r) => {
              const a = rowMean(from, r.keys);
              const b = rowMean(to, r.keys);
              const d = a != null && b != null ? Math.round((units.len(b) - units.len(a)) * 10) / 10 : null;
              const change = d == null ? "" : d === 0 ? "—" : `${d < 0 ? "↓" : "↑"}${Math.abs(d).toFixed(1)}`;
              return (
                <View
                  key={r.label}
                  accessible
                  accessibilityLabel={`${r.label}: ${cell(from, r.keys)} then ${cell(to, r.keys)} ${units.lenUnit}${change ? `, change ${change}` : ""}`}
                  style={[rowStyle, { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  <Text style={{ flex: 1.3, color: colors.textPrimary, fontSize: 14 }}>{r.label}</Text>
                  <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 14 }}>{cell(from, r.keys)}</Text>
                  <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{cell(to, r.keys)}</Text>
                  <Text style={{ width: 56, textAlign: "right", color: colors.textSecondary, fontSize: 14 }}>{change}</Text>
                </View>
              );
            })}
          </View>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            In {units.lenUnit}. L/R pairs show left / right; the change uses their average.
          </Text>

          <Pressable onPress={() => navigation.navigate("ProgressPhotos")} accessibilityRole="button" hitSlop={6}>
            <Text style={{ color: theme.accentText, ...typography.label, fontSize: 14 }}>Add progress photos</Text>
          </Pressable>
        </>
      )}

      <BottomSheet visible={picking !== null} onClose={() => setPicking(null)} title="Change dates">
        <SegmentedControl
          options={[
            { value: "from", label: from ? `From · ${dayMonth(from.loggedAt)}` : "From" },
            { value: "to", label: to ? `To · ${dayMonth(to.loggedAt)}` : "To" },
          ]}
          value={picking ?? "from"}
          onChange={setPicking}
        />
        {[...entries].reverse().map((e) => {
          const selected = picking === "from" ? e.id === from?.id : e.id === to?.id;
          const disabled = picking === "from" ? e.loggedAt >= (to?.loggedAt ?? "") : e.loggedAt <= (from?.loggedAt ?? "");
          return (
            <Pressable
              key={e.id}
              disabled={disabled}
              onPress={() => (picking === "from" ? setFromId(e.id) : setToId(e.id))}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: spacing.md,
                paddingVertical: 12,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: selected ? theme.accent : colors.border,
                backgroundColor: selected ? theme.accentSoft : "transparent",
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{longDate(e.loggedAt)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {COMPARE_ROWS.filter((r) => rowMean(e, r.keys) != null).length} parts
              </Text>
            </Pressable>
          );
        })}
        <Button label="Done" onPress={() => setPicking(null)} style={{ marginTop: spacing.sm }} />
      </BottomSheet>
    </ScreenContainer>
  );
}

const rowStyle = { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 10 } as const;
const headStyle = themed(() => ({ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 13 } as const));
