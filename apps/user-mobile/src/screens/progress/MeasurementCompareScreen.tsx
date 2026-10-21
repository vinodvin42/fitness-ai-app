import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BodyMeasurement } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonCard } from "../../components/Skeleton";
import { FigmaArt, MeasureHeader, MiniSegment, PillChip, measureSvg } from "../../components/MeasureUi";
import { fetchMeasurements } from "../../api/progress";
import { COMPARE_ROWS, MEASUREMENT_PARTS, changeArrow, defaultComparePair, measureDate, rowMean, tapeCount, trimLen } from "../../lib/measurementParts";
import { useMeasureUnits } from "../../lib/measureUnits";
import { colors, fonts, radius, spacing, themed } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "MeasurementCompare">;

const INSET = 8;

/**
 * Compare dates (Figma 06b measure-05): two logged checks side by side, the
 * body outline for each date, and every tape measurement with its change.
 * Opens on the dates the Body Measurements chip showed (or the latest full
 * check and the one about four weeks before it); "Change dates" picks any
 * two. Front/Back filters the rows. Rows with nothing on either date are left
 * out; a part missing on one date shows "—" and no change.
 */
export function MeasurementCompareScreen({ navigation, route }: Props) {
  const units = useMeasureUnits();
  const { colors: theme } = useTheme();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });
  const entries = [...(data ?? [])].filter((m) => tapeCount(m) > 0).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const [fromId, setFromId] = useState<string | null>(route.params?.fromId ?? null);
  const [toId, setToId] = useState<string | null>(route.params?.toId ?? null);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [view, setView] = useState<"front" | "back">("front");

  const fallback = defaultComparePair(entries);
  const from = entries.find((e) => e.id === fromId) ?? fallback?.from;
  const to = entries.find((e) => e.id === toId) ?? fallback?.to;

  const cell = (m: BodyMeasurement, keys: readonly (keyof typeof MEASUREMENT_PARTS)[]) => {
    const vals = keys.map((k) => m[MEASUREMENT_PARTS[k].field]);
    if (vals.every((v) => v == null)) return "—";
    return vals.map((v) => (v == null ? "—" : trimLen(units.len(v)))).join(" / ");
  };

  return (
    <ScreenContainer>
      <View style={{ paddingHorizontal: INSET, paddingTop: 12 }}>
        <MeasureHeader
          title="Compare dates"
          subtitle={from && to ? `${measureDate(from.loggedAt, "day")} vs ${measureDate(to.loggedAt, "day")}` : null}
          onBack={() => navigation.goBack()}
          right={<IconButton icon="plus" accessibilityLabel="Log new measurements" onPress={() => navigation.navigate("LogMeasurement")} size={32} iconSize={16} />}
        />
      </View>
      {isLoading ? (
        <SkeletonCard lines={6} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : entries.length < 2 || !from || !to ? (
        <EmptyState
          title="Log measurements twice to compare"
          subtitle="Compare shows how each part changed between two logged dates."
          actionLabel="Log new measurements"
          onAction={() => navigation.navigate("LogMeasurement")}
        />
      ) : (
        <View style={{ marginTop: -16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: INSET, paddingTop: 4, paddingBottom: 8 }}>
            <MiniSegment
              options={[
                { value: "front", label: "Front" },
                { value: "back", label: "Back" },
              ]}
              value={view}
              onChange={setView}
            />
            <PillChip label="Change dates" onPress={() => setPicking("from")} />
          </View>

          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: INSET, paddingTop: 4, paddingBottom: 8 }}>
            {[from, to].map((m, i) => (
              <View key={m.id} style={{ flex: 1, alignItems: "center", gap: 6, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.surface }}>
                <Text style={{ color: i === 0 ? colors.textSecondary : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 12 }}>
                  {measureDate(m.loggedAt, "day")}
                </Text>
                <FigmaArt svg={measureSvg(view === "front" ? "bodyPlain" : "bodyBack")} width={72} height={133.2} />
              </View>
            ))}
          </View>

          <View style={{ paddingHorizontal: INSET, paddingTop: 2 }}>
            <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceRaised }}>
                <Text style={[head, { width: 96 }]}>Part</Text>
                <Text style={[head, { width: 82 }]}>{measureDate(from.loggedAt, "dm")}</Text>
                <Text style={[head, { width: 82 }]}>{measureDate(to.loggedAt, "dm")}</Text>
                <Text style={[head, { flex: 1, textAlign: "right" }]}>Change</Text>
              </View>
              {COMPARE_ROWS.filter((r) => r.view === "both" || r.view === view)
                .filter((r) => rowMean(from, r.keys) != null || rowMean(to, r.keys) != null)
                .map((r) => {
                  const a = rowMean(from, r.keys);
                  const b = rowMean(to, r.keys);
                  const change = a != null && b != null ? changeArrow(Math.round((units.len(b) - units.len(a)) * 10) / 10) : "";
                  return (
                    <View
                      key={r.label}
                      accessible
                      accessibilityLabel={`${r.label}: ${cell(from, r.keys)} then ${cell(to, r.keys)} ${units.lenUnit}${change ? `, change ${change === "—" ? "none" : change}` : ""}`}
                      style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border }}
                    >
                      <Text style={{ width: 96, color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>{r.label}</Text>
                      <Text style={{ width: 82, color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>{cell(from, r.keys)}</Text>
                      <Text style={{ width: 82, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{cell(to, r.keys)}</Text>
                      <Text style={{ flex: 1, textAlign: "right", color: colors.textPrimary, fontFamily: fonts.body, fontSize: 13 }}>{change}</Text>
                    </View>
                  );
                })}
            </View>
          </View>

          <View style={{ paddingHorizontal: INSET, paddingTop: 12, paddingBottom: 24, gap: 2 }}>
            <Pressable onPress={() => navigation.navigate("ProgressPhotos")} accessibilityRole="button" hitSlop={6} style={{ alignSelf: "flex-start" }}>
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Add progress photos</Text>
            </Pressable>
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 }}>Photos stay private to you.</Text>
          </View>
        </View>
      )}

      <BottomSheet visible={picking !== null} onClose={() => setPicking(null)} title="Change dates">
        <SegmentedControl
          options={[
            { value: "from", label: from ? `From · ${measureDate(from.loggedAt, "dm")}` : "From" },
            { value: "to", label: to ? `To · ${measureDate(to.loggedAt, "dm")}` : "To" },
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
              <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{measureDate(e.loggedAt, "day")}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{tapeCount(e)} parts</Text>
            </Pressable>
          );
        })}
        <Button label="Done" onPress={() => setPicking(null)} style={{ marginTop: spacing.sm }} />
      </BottomSheet>
    </ScreenContainer>
  );
}

// themed(): rebuilt when the theme changes, like the rest of the app's static styles.
const head = themed(() => ({ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12 }) as const);
