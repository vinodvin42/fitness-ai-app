import React from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationProp } from "@react-navigation/native";
import type { FitnessMissing, HealthspanSummary, HeartMissing } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Icon, type IconName } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchHealthspan, HEALTHSPAN_KEY } from "../../api/healthspan";
import { useMeasureUnits } from "../../lib/measureUnits";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import type { MainTabsParamList } from "../../navigation/MainTabs";

type Props = NativeStackScreenProps<ProgressStackParamList, "Healthspan">;

/** "4 years younger" / "3 years older" / "Same as your age". */
function diffText(est: number, age: number): { text: string; good: boolean | null } {
  const d = Math.round(est - age);
  if (d === 0) return { text: "Same as your age", good: null };
  return { text: `${Math.abs(d)} year${Math.abs(d) === 1 ? "" : "s"} ${d < 0 ? "younger" : "older"}`, good: d < 0 };
}

function AgeTile({ label, value, sub, good }: { label: string; value: string; sub: string | null; good: boolean | null }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: spacing.sm }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 28 }}>{value}</Text>
      {sub ? (
        <Text style={{ color: good === true ? colors.successText : good === false ? colors.warningText : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13, textAlign: "center" }}>
          {sub}
        </Text>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}> </Text>
      )}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, paddingVertical: 6 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14, flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
}

function ActionRow({ icon, label, onPress, first }: { icon: IconName; label: string; onPress: () => void; first?: boolean }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
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
      <View style={{ width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={16} color={colors.textSecondary} />
      </View>
      <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>Add ›</Text>
    </Pressable>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
      <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** The WHO charts' colour bands. */
const BAND_LABEL: Record<NonNullable<HealthspanSummary["risk"]["band"]>, string> = {
  "<5": "Under 5%",
  "5-10": "5% to 10%",
  "10-20": "10% to 20%",
  "20-30": "20% to 30%",
  ">=30": "30% or more",
};
function bandColors(band: NonNullable<HealthspanSummary["risk"]["band"]>): { fg: string; bg: string } {
  if (band === "<5") return { fg: colors.successText, bg: colors.successSoft };
  if (band === "5-10") return { fg: colors.warningText, bg: colors.warningSoft };
  return { fg: colors.dangerText, bg: colors.dangerSoft };
}

const DRIVER_LABEL: Record<HealthspanSummary["heart"]["drivers"][number], string> = {
  blood_pressure: "Blood pressure above 125",
  bp_medication: "On blood-pressure medicine",
  bmi: "BMI above 22.5",
  smoking: "Smoking",
  diabetes: "Diabetes",
};

/**
 * Healthspan (owner, 25 Oct 2026, phases 1 and 2). Real age next to fitness
 * age and heart age, what each is based on, what's missing and where to add
 * it, plus links to sleep & recovery, blood-pressure / VO2max readings and
 * 12-month trends. Every number is an estimate from a published model
 * (apps/api modules/healthspan/healthspan.math.ts), said so on the screen,
 * never a diagnosis.
 */
export function HealthspanScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const { colors: theme } = useTheme();
  const q = useQuery({ queryKey: HEALTHSPAN_KEY, queryFn: fetchHealthspan });
  const more = navigation.getParent<NavigationProp<MoreStackParamList>>();
  const tabs = () => more?.getParent<NavigationProp<MainTabsParamList>>();
  const onBack = () => navigation.goBack();

  if (q.isLoading) {
    return (
      <ScreenContainer title="Healthspan" onBack={onBack}>
        <SkeletonCard lines={5} />
      </ScreenContainer>
    );
  }
  if (q.isError || !q.data) {
    return (
      <ScreenContainer title="Healthspan" onBack={onBack}>
        <ErrorState message="Couldn't load your healthspan." onRetry={() => q.refetch()} />
      </ScreenContainer>
    );
  }

  const s = q.data;
  const fit = s.fitness;
  const heart = s.heart;
  const risk = s.risk;
  const fitDiff = fit.fitnessAge != null && s.age != null ? diffText(fit.fitnessAge, s.age) : null;
  const heartDiff = heart.heartAge != null && s.age != null ? diffText(heart.heartAge, s.age) : null;
  const fitValue = fit.fitnessAge != null ? `${fit.bound === "under" ? "<" : fit.bound === "over" ? ">" : ""}${fit.fitnessAge}` : "—";

  const fitAction: Record<FitnessMissing, { icon: IconName; label: string; go: () => void }> = {
    age: { icon: "calendar", label: "Date of birth", go: () => more?.navigate("EditProfile") },
    sex: { icon: "user", label: "Sex (in your profile)", go: () => more?.navigate("EditProfile") },
    waist: { icon: "ruler", label: "Waist measurement", go: () => navigation.navigate("LogMeasurement") },
    resting_hr: { icon: "heart", label: "Resting heart rate (log or a device)", go: () => tabs()?.navigate("Recover", { screen: "Recovery", initial: false }) },
    activity: { icon: "activity", label: "How you exercise (3 questions)", go: () => navigation.navigate("HealthspanAnswers") },
  };
  const heartAction: Record<HeartMissing, { icon: IconName; label: string; go: () => void }> = {
    age: fitAction.age,
    sex: fitAction.sex,
    blood_pressure: { icon: "heart-pulse", label: "Blood pressure reading", go: () => navigation.navigate("HealthReadings", { kind: "blood_pressure" }) },
    height_weight: { icon: "scale", label: "Height and weight (profile)", go: () => more?.navigate("EditProfile") },
    smoking: { icon: "wind", label: "Smoking", go: () => navigation.navigate("HealthspanAnswers") },
    bp_medication: { icon: "pill", label: "Blood-pressure medicine", go: () => navigation.navigate("HealthspanAnswers") },
    health_answers: { icon: "shield-check", label: "Health conditions", go: () => more?.navigate("HealthSafety") },
  };

  return (
    <ScreenContainer
      title="Healthspan"
      subtitle="Estimates from published research, not a diagnosis"
      onBack={onBack}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={theme.accent} />}
    >
      {/* Ages at a glance */}
      <Card style={{ flexDirection: "row", alignItems: "stretch", paddingHorizontal: spacing.sm }}>
        <AgeTile label="Your age" value={s.age != null ? String(s.age) : "—"} sub={s.age != null ? "Calendar age" : "Add date of birth"} good={null} />
        <View style={{ width: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />
        <AgeTile label="Fitness age" value={fitValue} sub={fitDiff?.text ?? null} good={fitDiff?.good ?? null} />
        <View style={{ width: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />
        <AgeTile label="Heart age" value={heart.heartAge != null ? String(heart.heartAge) : "—"} sub={heartDiff?.text ?? null} good={heartDiff?.good ?? null} />
      </Card>

      {/* Fitness age */}
      <SectionHeader title="Fitness age" />
      <Card style={{ gap: spacing.sm }}>
        {fit.status === "ready" && fit.vo2max != null ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
              Your VO₂max of <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi }}>{fit.vo2max} mL/kg/min</Text>{" "}
              {fit.vo2Source === "measured" ? "(from your reading)" : "(estimated)"} is the average for a {s.sex === "female" ? "woman" : "man"} of{" "}
              {fit.bound === "under" ? "under 20" : fit.bound === "over" ? "over 90" : fit.fitnessAge} in the HUNT3 fitness study.
            </Text>
            {fit.vo2Source === "estimated" ? (
              <View>
                <Fact label="Waist" value={fit.inputs.waistCm != null ? `${units.len(fit.inputs.waistCm)} ${units.lenUnit}` : "—"} />
                <Fact label="Resting heart rate" value={fit.inputs.restingHr != null ? `${fit.inputs.restingHr} bpm` : "—"} />
                <Fact label="Activity score" value={fit.inputs.paIndex != null ? `${fit.inputs.paIndex} of 15` : "—"} />
              </View>
            ) : (
              <Fact label="Measured" value={fit.vo2At ? new Date(fit.vo2At).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"} />
            )}
            <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.xs }}>
              <TextLink label="Add VO₂max reading" onPress={() => navigation.navigate("HealthReadings", { kind: "vo2max" })} />
              <TextLink label="Activity answers" onPress={() => navigation.navigate("HealthspanAnswers")} />
            </View>
          </>
        ) : fit.status === "out_of_range" ? (
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>Fitness age is worked out for ages 20 to 90.</Text>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
              Add these, or a VO₂max reading from your watch, to see your fitness age.
            </Text>
            {fit.missing.map((m, i) => (
              <ActionRow key={m} first={i === 0} icon={fitAction[m].icon} label={fitAction[m].label} onPress={fitAction[m].go} />
            ))}
          </>
        )}
      </Card>

      {/* 10-year risk: WHO 2019 non-laboratory chart for South Asia */}
      <SectionHeader title="10-year heart risk" />
      <Card style={{ gap: spacing.sm }}>
        {risk.status === "ready" && risk.riskPct != null && risk.band ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 32 }}>{risk.riskPct}%</Text>
              <View style={{ borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: bandColors(risk.band).bg }}>
                <Text style={{ color: bandColors(risk.band).fg, fontFamily: fonts.bodySemi, fontSize: 13 }}>WHO band: {BAND_LABEL[risk.band]}</Text>
              </View>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
              Chance of a heart attack or stroke in the next 10 years, from the WHO 2019 chart for South Asia, using your age, sex, blood
              pressure, BMI and smoking.
            </Text>
            {risk.diabetesNotIncluded ? (
              <Text style={{ color: colors.warningText, fontSize: 13, lineHeight: 18 }}>
                This chart doesn't include diabetes, so your real risk may be higher. Talk to your doctor about it.
              </Text>
            ) : null}
          </>
        ) : risk.status === "out_of_range" ? (
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>The WHO chart covers ages 40 to 74.</Text>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>Add these to see your 10-year risk.</Text>
            {risk.missing.map((m, i) => (
              <ActionRow key={m} first={i === 0} icon={heartAction[m].icon} label={heartAction[m].label} onPress={heartAction[m].go} />
            ))}
          </>
        )}
      </Card>

      {/* Heart age (Framingham, a guide) */}
      <SectionHeader title="Heart age" />
      <Card style={{ gap: spacing.sm }}>
        {heart.status === "ready" && heart.heartAge != null ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
              As a guide, your heart and blood vessels look like those of someone aged {heart.heartAge} with normal blood pressure and weight
              who doesn't smoke (Framingham heart age).
            </Text>
            {heart.drivers.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {heart.drivers.map((d) => (
                  <View key={d} style={{ borderRadius: radius.pill, backgroundColor: colors.warningSoft, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: colors.warningText, fontFamily: fonts.bodySemi, fontSize: 13 }}>{DRIVER_LABEL[d]}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View>
              <Fact
                label="Blood pressure"
                value={
                  heart.inputs.systolic != null
                    ? `${heart.inputs.systolic}/${heart.inputs.diastolic}${heart.inputs.bpReadings > 1 ? ` (avg of ${heart.inputs.bpReadings})` : ""}`
                    : "—"
                }
              />
              <Fact label="BMI" value={heart.inputs.bmi != null ? String(heart.inputs.bmi) : "—"} />
              <Fact label="Smoking" value={heart.inputs.smoker ? "Yes" : "No"} />
              <Fact label="Blood-pressure medicine" value={heart.inputs.bpTreated ? "Yes" : "No"} />
              <Fact label="Diabetes" value={heart.inputs.diabetes ? "Yes" : "No"} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.xs }}>
              <TextLink label="Add blood pressure" onPress={() => navigation.navigate("HealthReadings", { kind: "blood_pressure" })} />
              <TextLink label="Answers" onPress={() => navigation.navigate("HealthspanAnswers")} />
            </View>
          </>
        ) : heart.status === "out_of_range" ? (
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>Heart age uses a model made for ages 30 to 74.</Text>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>Add these to see your heart age.</Text>
            {heart.missing.map((m, i) => (
              <ActionRow key={m} first={i === 0} icon={heartAction[m].icon} label={heartAction[m].label} onPress={heartAction[m].go} />
            ))}
          </>
        )}
      </Card>

      {/* Readings and trends */}
      <SectionHeader title="Readings and trends" />
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {(
          [
            { icon: "heart-pulse", title: "Blood pressure", sub: "Add a reading or sync from Health Connect", go: () => navigation.navigate("HealthReadings", { kind: "blood_pressure" }) },
            { icon: "activity", title: "VO₂max", sub: "From your watch or a fitness test", go: () => navigation.navigate("HealthReadings", { kind: "vo2max" }) },
            { icon: "line-chart", title: "Long-term trends", sub: "Monthly averages over the last year", go: () => navigation.navigate("HealthTrends") },
            { icon: "moon", title: "Sleep health", sub: "Sleep need, stages, efficiency and consistency", go: () => tabs()?.navigate("Recover", { screen: "Sleep", initial: false }) },
            { icon: "trending-up", title: "Recovery trends", sub: "HRV, resting heart rate, stress and recovery", go: () => tabs()?.navigate("Recover", { screen: "RecoveryTrends", initial: false }) },
          ] as Array<{ icon: IconName; title: string; sub: string; go: () => void }>
        ).map((r, i) => (
          <Pressable
            key={r.title}
            onPress={r.go}
            accessibilityRole="button"
            accessibilityLabel={`${r.title}. ${r.sub}`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingHorizontal: spacing.md,
              paddingVertical: 14,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
              backgroundColor: pressed ? colors.surfaceRaised : "transparent",
            })}
          >
            <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" }}>
              <Icon name={r.icon} size={18} color={theme.accentText} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{r.title}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{r.sub}</Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </Card>

      <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 18 }}>
        10-year risk: WHO 2019 non-laboratory model, recalibrated for South Asia. Heart age: Framingham 2008 office-based model, made in a US
        population, so treat it as a guide. Fitness age: NTNU / HUNT fitness model (Nes et al. 2011) and HUNT3 averages. These are
        estimates, not medical advice. Talk to a doctor about your heart health.
      </Text>
    </ScreenContainer>
  );
}
