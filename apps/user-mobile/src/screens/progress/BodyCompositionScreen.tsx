import React from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { BodySilhouette, DualLineChart } from "../../components/ProgressCharts";
import { fetchBodyComposition } from "../../api/progress";
import { BRAND_NAME } from "../../lib/brand";
import { useMeasureUnits } from "../../lib/measureUnits";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "BodyComposition">;

function Tag({ evidence }: { evidence: "measured" | "estimated" }) {
  const measured = evidence === "measured";
  return (
    <Text
      style={{
        color: measured ? colors.success : colors.warning,
        backgroundColor: measured ? colors.successSoft : colors.warningSoft,
        ...typography.caption,
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {measured ? "Measured" : "Estimated"}
    </Text>
  );
}

function Metric({
  label,
  value,
  evidence,
  note,
  empty,
}: {
  label: string;
  value: string | null;
  evidence: "measured" | "estimated";
  note: string;
  empty: string;
}) {
  return (
    <View style={{ gap: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>{label}</Text>
        {value != null ? <Tag evidence={evidence} /> : null}
      </View>
      <Text style={{ color: value != null ? colors.accent : colors.textMuted, fontFamily: fonts.displayBold, fontSize: 18 }}>{value ?? "-"}</Text>
      <Text style={{ color: colors.textMuted, ...typography.caption }}>{value != null ? note : empty}</Text>
    </View>
  );
}

/**
 * Body Comp (Figma Progress 02). Measured = typed by you or synced from a
 * scale; Estimated = derived on the server (lean mass = weight x (1 - body
 * fat %), BMI from height, waist-to-hip ratio). An estimate is only shown when
 * every input exists, and the Smart-scale card appears only when a scale is
 * connected AND has synced weight / body-fat data. None of this is a clinical
 * measurement.
 */
export function BodyCompositionScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const { width } = useWindowDimensions();
  const inner = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.md * 2;
  const figW = Math.min(150, inner * 0.42);
  const chartW = inner;
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["progress", "composition"], queryFn: fetchBodyComposition });

  const lean = data?.trend.filter((t) => t.leanMassKg != null).map((t) => ({ at: t.at, value: units.wt(t.leanMassKg as number) })) ?? [];
  const fat = data?.trend.map((t) => ({ at: t.at, value: t.bodyFatPercent })) ?? [];

  return (
    <ScreenContainer title="Body Comp" eyebrow={BRAND_NAME} subtitle="Body Measurements & Trends">
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <SkeletonCard lines={5} />
      ) : isError || !data ? (
        <ErrorState message="Couldn't load your body composition." onRetry={() => refetch()} />
      ) : (
        <>
          <Card style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
            <View style={{ width: figW }}>
              <BodySilhouette width={figW} />
            </View>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Metric
                label="Body fat"
                value={data.latest.bodyFatPercent ? `${data.latest.bodyFatPercent.value}%` : null}
                evidence="measured"
                note={data.latest.bodyFatPercent?.source === "device" ? "Smart scale" : "User entered"}
                empty="Log body fat to see this"
              />
              <Metric
                label="Lean mass"
                value={data.latest.leanMassKg ? `${units.wt(data.latest.leanMassKg.value)} ${units.wtUnit}` : null}
                evidence="estimated"
                note="Weight x (1 - body fat %)"
                empty="Needs weight and body fat"
              />
              <Metric
                label="BMI"
                value={data.latest.bmi ? String(data.latest.bmi.value) : null}
                evidence="estimated"
                note={data.latest.bmi ? `${data.latest.bmi.band} · not a diagnosis` : ""}
                empty="Needs weight and height"
              />
              <Metric
                label="Waist-hip ratio"
                value={data.latest.waistToHip ? data.latest.waistToHip.value.toFixed(2) : null}
                evidence="estimated"
                note={data.latest.waistToHip?.band ?? "Set gender in your profile for a range"}
                empty="Needs waist and hips"
              />
            </View>
          </Card>

          <Button label="Log New Measurements" onPress={() => navigation.navigate("LogMeasurement")} />

          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>6-Month Trends</Text>
              <Text style={{ color: colors.accent, ...typography.caption }}>Fat vs Estimated Lean Mass</Text>
            </View>
            {fat.length >= 2 ? (
              <>
                <DualLineChart
                  a={fat}
                  b={lean}
                  width={chartW}
                  accessibilityLabel={`Body fat percent ${fat[0].value} to ${fat[fat.length - 1].value}; estimated lean mass trend`}
                />
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
                    <Text style={{ color: colors.textMuted, ...typography.meta }}>
                      Body fat {fat[0].value}% to {fat[fat.length - 1].value}%
                    </Text>
                  </View>
                  {lean.length >= 2 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.aiAccent }} />
                      <Text style={{ color: colors.textMuted, ...typography.meta }}>
                        Lean {lean[0].value} to {lean[lean.length - 1].value} {units.wtUnit}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 16 }}>
                  Blue: body fat % (measured). Violet: lean mass (estimated from weight and body fat). Each line is scaled to its own range, so
                  compare direction, not height. Estimates vary and are not a clinical measurement.
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.textMuted }}>Log body fat at least twice to see a trend here.</Text>
            )}
          </Card>

          {data.scale ? (
            <Card style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Smart-scale estimates</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View
                  style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}
                >
                  <Icon name="refresh-cw" size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, ...typography.label }}>{data.scale.deviceName}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>
                    Last synced {new Date(data.scale.lastSyncAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {data.scale.latestWeightKg != null ? ` · ${units.wt(data.scale.latestWeightKg)} ${units.wtUnit}` : ""}
                    {data.scale.latestBodyFatPercent != null ? ` · ${data.scale.latestBodyFatPercent}% fat` : ""}
                  </Text>
                </View>
                <Text style={{ color: colors.success, ...typography.label }}>Synced</Text>
              </View>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>Scale body-fat readings are estimates and can vary with hydration.</Text>
            </Card>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}
