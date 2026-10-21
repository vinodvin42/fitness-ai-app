import React, { useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BodyMeasurement } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonCard } from "../../components/Skeleton";
import { BodyMap, type BodyMapValue } from "../../components/BodyMap";
import { MeasurementPartSheet } from "../../components/MeasurementPartSheet";
import { HowToMeasureSheet } from "../../components/HowToMeasureSheet";
import { MeasureHeader, MiniSegment, PillChip } from "../../components/MeasureUi";
import { fetchOnboardingProfile } from "../../api/users";
import {
  BACK_SPOTS,
  FRONT_SPOTS,
  MEASUREMENT_PARTS,
  changeArrow,
  defaultComparePair,
  measureDate,
  pickPart,
  trimLen,
  type MeasurementPartKey,
} from "../../lib/measurementParts";
import { fetchMeasurements } from "../../api/progress";
import { useMeasureUnits } from "../../lib/measureUnits";
import { fieldChange } from "../../lib/measurementFields";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, layout, radius } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "MeasurementHistory">;

/** Figma's sections sit 24 px in; the map card 16 px (the screen's own padding). */
const INSET = 8;

/**
 * Body Measurements (Figma 06b measure-01 front, measure-02 back, with the
 * part sheet of measure-03 and the how-to sheet of measure-06).
 *
 * - The map shows each part's latest value and its change since the compared
 *   date. The chip "Sat 24 Oct vs Thu 24 Sep" names the two checks (the latest
 *   full check and the one about four weeks before it) and opens Compare dates.
 * - "Since …" lists the three biggest changes on this side of the body.
 * - Nothing is estimated: a part never measured shows "—"; one first measured
 *   after the compared date shows "new".
 */
export function MeasurementHistoryScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const { width } = useWindowDimensions();
  const { colors: theme } = useTheme();
  const [view, setView] = useState<"front" | "back">("front");
  const [openPart, setOpenPart] = useState<MeasurementPartKey | null>(null);
  const [howTo, setHowTo] = useState<{ focus: MeasurementPartKey | null } | null>(null);
  const { data: profile } = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile, staleTime: 60_000 });
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });

  const rows = data ?? [];
  const mapW = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2;
  const latestRow = rows.reduce<BodyMeasurement | null>((a, r) => (!a || r.loggedAt > a.loggedAt ? r : a), null);
  const pair = defaultComparePair(rows);
  const spots = view === "front" ? FRONT_SPOTS : BACK_SPOTS;
  const lenText = (cm: number) => `${trimLen(units.len(cm))} ${units.lenUnit}`;

  // Each part: latest value, and its change since the compared ("from") check.
  const changeOf = (key: MeasurementPartKey): { latest: number; d: number | null; isNew: boolean } | null => {
    const c = fieldChange(rows, pickPart(key));
    if (!c.latest) return null;
    if (!pair || c.latest.at <= pair.from.loggedAt) return { latest: c.latest.value, d: null, isNew: false };
    const before = pair.from[MEASUREMENT_PARTS[key].field];
    if (before == null) return { latest: c.latest.value, d: null, isNew: true };
    return { latest: c.latest.value, d: Math.round((units.len(c.latest.value) - units.len(before)) * 10) / 10, isNew: false };
  };

  const mapValues: Partial<Record<MeasurementPartKey, BodyMapValue>> = {};
  for (const key of Object.keys(MEASUREMENT_PARTS) as MeasurementPartKey[]) {
    const c = changeOf(key);
    if (!c) continue;
    mapValues[key] = { value: lenText(c.latest), change: c.isNew ? "new" : changeArrow(c.d) };
  }

  // "Since 24 Sep": the three biggest changes on this side, largest first.
  const changed = spots
    .map((s) => ({ key: s.key, c: changeOf(s.key) }))
    .filter((x): x is { key: MeasurementPartKey; c: { latest: number; d: number; isNew: boolean } } => x.c?.d != null && x.c.d !== 0)
    .sort((a, b) => Math.abs(b.c.d) - Math.abs(a.c.d))
    .slice(0, 3);
  const sinceText = changed
    .map(({ key, c }, i) => {
      const label = MEASUREMENT_PARTS[key].label;
      return `${i === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1)} ${c.d < 0 ? "↓" : "↑"}${trimLen(Math.abs(c.d))} ${units.lenUnit}`;
    })
    .join(" · ");
  const newPart = spots.find((s) => changeOf(s.key)?.isNew);

  // Opening one sheet from another: let the first close before the second slides up.
  const showHowTo = (focus: MeasurementPartKey | null) => {
    if (openPart === null) {
      setHowTo({ focus });
      return;
    }
    setOpenPart(null);
    setTimeout(() => setHowTo({ focus }), 350);
  };

  const logNew = () => navigation.navigate("LogMeasurement");

  return (
    <ScreenContainer>
      <View style={{ paddingHorizontal: INSET, paddingTop: 12 }}>
        <MeasureHeader
          title="Body Measurements"
          subtitle={latestRow ? `Updated ${measureDate(latestRow.loggedAt, "dayComma")}` : null}
          onBack={() => navigation.goBack()}
          right={<IconButton icon="plus" accessibilityLabel="Log new measurements" onPress={logNew} size={32} iconSize={16} />}
        />
      </View>
      {isLoading ? (
        <SkeletonCard lines={4} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No measurements logged yet"
          subtitle="Log your body measurements to see them on the figure and track changes."
          actionLabel="Log new measurements"
          onAction={logNew}
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
            {pair ? (
              <PillChip
                label={`${measureDate(pair.to.loggedAt, "day")} vs ${measureDate(pair.from.loggedAt, "day")}`}
                accessibilityLabel={`Comparing ${measureDate(pair.to.loggedAt, "day")} with ${measureDate(pair.from.loggedAt, "day")}. Open Compare dates`}
                onPress={() => navigation.navigate("MeasurementCompare", { fromId: pair.from.id, toId: pair.to.id })}
              />
            ) : null}
          </View>

          <View style={{ paddingTop: 4, paddingBottom: 8 }}>
            <BodyMap width={mapW} view={view} spots={spots} values={mapValues} onSelect={setOpenPart} />
          </View>

          <View style={{ paddingHorizontal: INSET, paddingTop: 4, gap: 10 }}>
            {pair && changed.length > 0 ? (
              <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, gap: 4 }}>
                <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>Since {measureDate(pair.from.loggedAt, "dm")}</Text>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{sinceText}</Text>
              </View>
            ) : null}
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 }}>
              {newPart ? `${MEASUREMENT_PARTS[newPart.key].label} is new, so it has no change yet. ` : "Tape changes reflect size, not muscle or fat. "}
              <Text onPress={() => showHowTo(null)} accessibilityRole="link" style={{ color: theme.accentText }}>
                Learn more
              </Text>
            </Text>
          </View>

          <View style={{ paddingHorizontal: INSET, paddingTop: 12, paddingBottom: 24 }}>
            <Button label="Log new measurements" onPress={logNew} />
          </View>
        </View>
      )}
      <MeasurementPartSheet
        part={openPart}
        rows={rows}
        since={pair?.from ?? null}
        heightCm={profile?.heightCm ?? null}
        onHowTo={(k) => showHowTo(k)}
        onClose={() => setOpenPart(null)}
      />
      <HowToMeasureSheet visible={howTo !== null} focus={howTo?.focus ?? null} onClose={() => setHowTo(null)} />
    </ScreenContainer>
  );
}
