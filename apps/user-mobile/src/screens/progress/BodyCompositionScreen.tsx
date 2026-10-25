import React from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationProp } from "@react-navigation/native";
import type { BodyComposition } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon, type IconName } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { BodySilhouette, DualLineChart } from "../../components/ProgressCharts";
import { fetchBodyComposition } from "../../api/progress";
import { useMeasureUnits } from "../../lib/measureUnits";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "BodyComposition">;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** One metric row: name (with ~ when estimated) and how it was worked out, value on the right. */
function MetricRow({
  label,
  estimated,
  value,
  detail,
  first,
}: {
  label: string;
  estimated: boolean;
  value: string | null;
  detail: string;
  first?: boolean;
}) {
  const { colors: theme } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}${estimated ? ", estimated" : ""}: ${value ?? "not available"}. ${detail}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>
          {label}
          {estimated ? <Text style={{ color: colors.textSecondary }}> (~)</Text> : null}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 17 }} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <Text style={{ color: value != null ? theme.accentText : colors.textMuted, fontFamily: fonts.displayBold, fontSize: 18 }}>{value ?? "—"}</Text>
    </View>
  );
}

/** A missing input, with where to add it. */
function MissingRow({ icon, label, onPress, first }: { icon: IconName; label: string; onPress: () => void; first?: boolean }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add ${label}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={17} color={colors.textSecondary} />
      </View>
      <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>Add ›</Text>
    </Pressable>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

/** The newest date any value was logged or synced. */
function lastUpdated(c: BodyComposition): string | null {
  const dates = [c.latest.weightKg?.at, c.latest.bodyFatPercent?.at, c.latest.leanMassKg?.at, c.latest.bmi?.at, c.latest.waistToHip?.at].filter(
    (d): d is string => !!d,
  );
  return dates.length ? dates.sort().slice(-1)[0] : null;
}

/**
 * Body composition (Figma Progress 02). Measured = typed by you or synced from
 * a scale; Estimated (~) = derived on the server (lean mass = weight x (1 -
 * body fat %), BMI from height, waist-to-hip ratio). An estimate is only shown
 * when every input exists, and the smart-scale source appears only when a
 * scale is connected AND has synced weight / body-fat data. None of this is a
 * clinical measurement.
 *
 * 25 Oct 2026 (owner: "arrange this like a senior designer"): one row per
 * metric with its value on the right and how it was worked out underneath;
 * missing inputs gathered into one "Complete your picture" card with a
 * place to add each; the 6-month trend with a legend; and the data source
 * (scale, or entered by you with the last date), as in the Figma.
 */
export function BodyCompositionScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const { colors: theme } = useTheme();
  const { width } = useWindowDimensions();
  const inner = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.md * 2;
  const figW = Math.min(112, inner * 0.32);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["progress", "composition"], queryFn: fetchBodyComposition });
  const parent = navigation.getParent<NavigationProp<MoreStackParamList>>();
  const logMeasurements = () => navigation.navigate("LogMeasurement");

  const lean = data?.trend.filter((t) => t.leanMassKg != null).map((t) => ({ at: t.at, value: units.wt(t.leanMassKg as number) })) ?? [];
  const fat = data?.trend.map((t) => ({ at: t.at, value: t.bodyFatPercent })) ?? [];
  const updated = data ? lastUpdated(data) : null;

  const missing: Array<{ key: string; icon: IconName; label: string; onPress: () => void }> = [];
  if (data) {
    if (!data.latest.weightKg) missing.push({ key: "weight", icon: "scale", label: "Weight", onPress: () => navigation.navigate("LogWeight") });
    if (!data.latest.bodyFatPercent) missing.push({ key: "fat", icon: "activity", label: "Body fat %", onPress: logMeasurements });
    if (data.heightCm == null) missing.push({ key: "height", icon: "ruler", label: "Height (in your profile)", onPress: () => parent?.navigate("EditProfile") });
    if (!data.latest.waistToHip) missing.push({ key: "whr", icon: "ruler", label: "Waist and hips", onPress: logMeasurements });
  }

  return (
    <ScreenContainer
      title="Body composition"
      subtitle={updated ? `Updated ${shortDate(updated)}` : "Measured and estimated from your logs"}
      onBack={() => navigation.goBack()}
    >
      {isLoading ? (
        <SkeletonCard lines={5} />
      ) : isError || !data ? (
        <ErrorState message="Couldn't load your body composition." onRetry={() => refetch()} />
      ) : (
        <>
          <Card style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
            <View
              style={{ width: figW, alignSelf: "stretch", borderRadius: radius.md, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm }}
            >
              <BodySilhouette width={figW - 16} />
            </View>
            <View style={{ flex: 1 }}>
              <MetricRow
                first
                label="Body fat"
                estimated={false}
                value={data.latest.bodyFatPercent ? `${data.latest.bodyFatPercent.value}%` : null}
                detail={
                  data.latest.bodyFatPercent
                    ? data.latest.bodyFatPercent.source === "device"
                      ? "From your smart scale"
                      : "Entered by you"
                    : "Not logged yet"
                }
              />
              <MetricRow
                label="Lean mass"
                estimated
                value={data.latest.leanMassKg ? `${units.wt(data.latest.leanMassKg.value).toFixed(1)} ${units.wtUnit}` : null}
                detail={data.latest.leanMassKg ? "Weight × (1 − body fat %)" : "Needs weight and body fat"}
              />
              <MetricRow
                label="BMI"
                estimated
                value={data.latest.bmi ? String(data.latest.bmi.value) : null}
                detail={data.latest.bmi ? `${data.latest.bmi.band} · not a diagnosis` : "Needs weight and height"}
              />
              <MetricRow
                label="Waist-to-hip"
                estimated
                value={data.latest.waistToHip ? data.latest.waistToHip.value.toFixed(2) : null}
                detail={data.latest.waistToHip ? data.latest.waistToHip.band ?? "Set gender in your profile for a range" : "Needs waist and hips"}
              />
            </View>
          </Card>

          <Button label="Log new measurements" onPress={logMeasurements} />

          {missing.length > 0 ? (
            <>
              <SectionHeader title="Complete your picture" />
              <Card style={{ paddingVertical: spacing.xs }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
                  Add these and the matching values above fill in by themselves.
                </Text>
                {missing.map((m, i) => (
                  <MissingRow key={m.key} first={i === 0} icon={m.icon} label={m.label} onPress={m.onPress} />
                ))}
              </Card>
            </>
          ) : null}

          <SectionHeader title="6-month trend" />
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
              <LegendDot color={theme.accent} label="Body fat %" />
              <LegendDot color={colors.aiAccent} label="Lean mass (~)" />
            </View>
            {fat.length >= 2 ? (
              <>
                <DualLineChart
                  a={fat}
                  b={lean}
                  width={inner}
                  accessibilityLabel={`Body fat percent ${fat[0].value} to ${fat[fat.length - 1].value}; estimated lean mass trend`}
                />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: spacing.sm + 2, gap: 2 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Body fat</Text>
                    <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 16 }}>
                      {fat[0].value}% → {fat[fat.length - 1].value}%
                    </Text>
                  </View>
                  {lean.length >= 2 ? (
                    <View style={{ flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: spacing.sm + 2, gap: 2 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Lean mass (~)</Text>
                      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 16 }}>
                        {lean[0].value.toFixed(1)} → {lean[lean.length - 1].value.toFixed(1)} {units.wtUnit}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
                  Each line has its own scale, so compare the direction, not the height.
                </Text>
              </>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="line-chart" size={18} color={colors.textSecondary} />
                </View>
                <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                  Log body fat on two or more days to see how it moves over time.
                </Text>
              </View>
            )}
          </Card>

          <SectionHeader title="Data source" />
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.md,
                  backgroundColor: data.scale ? colors.successSoft : colors.surfaceRaised,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={data.scale ? "refresh-cw" : "pencil"} size={18} color={data.scale ? colors.success : colors.textSecondary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{data.scale ? data.scale.deviceName : "Entered by you"}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {data.scale
                    ? `Synced ${shortDate(data.scale.lastSyncAt)}${data.scale.latestWeightKg != null ? ` · ${units.wt(data.scale.latestWeightKg).toFixed(1)} ${units.wtUnit}` : ""}${
                        data.scale.latestBodyFatPercent != null ? ` · ${data.scale.latestBodyFatPercent}% fat` : ""
                      }`
                    : updated
                      ? `Last updated ${shortDate(updated)}`
                      : "Nothing logged yet"}
                </Text>
              </View>
              <View style={{ borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: data.scale ? colors.successSoft : colors.surfaceRaised }}>
                <Text style={{ color: data.scale ? colors.successText : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
                  {data.scale ? "Synced" : "Manual"}
                </Text>
              </View>
            </View>
            {data.scale ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>Scale body-fat readings are estimates and can vary with hydration.</Text>
            ) : null}
          </Card>

          <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>
            (~) estimated from your logs. Estimates vary and aren't a clinical measurement.
          </Text>
        </>
      )}
    </ScreenContainer>
  );
}
