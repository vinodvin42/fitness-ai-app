import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { WorkoutPhase } from "@fitness-ai-app/types";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { fetchSessionSummary } from "../../api/workoutSessions";
import { kgToDisplay, useWorkoutSettings } from "../../api/workoutSettings";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";
import type { MainTabsParamList } from "../../navigation/MainTabs";

type Props = NativeStackScreenProps<TrainStackParamList, "WorkoutComplete">;

const PHASE_LABEL: Record<WorkoutPhase, string> = {
  warmup: "Warm-up & Mobility",
  main: "Strength Phase",
  cooldown: "Cooldown Stretch",
};

/**
 * Workout Complete (Figma Train 10): gradient header, duration / volume / sets
 * tiles (no calorie figure exists, so sets replaces it), this session's new
 * personal records, per-phase breakdown from the logged sets, and a
 * rule-based insight. Heart-rate zones need wearable data this build does not
 * receive, so that block says so rather than drawing a chart.
 */
export function WorkoutCompleteScreen({ route, navigation }: Props) {
  const { sessionId, workoutName } = route.params;
  const tabs = useNavigation<NavigationProp<MainTabsParamList>>();
  const { data: settings } = useWorkoutSettings();
  const unit = settings?.weightUnit ?? "kg";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["workoutSessions", sessionId, "summary"],
    queryFn: () => fetchSessionSummary(sessionId),
  });
  const vol = (kg: number) => `${Math.round(kgToDisplay(kg, unit)).toLocaleString()} ${unit}`;

  const insight = !data
    ? null
    : data.newPersonalRecords.length > 0
      ? `You set ${data.newPersonalRecords.length} new personal record${data.newPersonalRecords.length === 1 ? "" : "s"} today. Give those muscles a lighter day or a mobility session before you push them again.`
      : data.trainingStreak.currentStreak > 1
        ? `That is ${data.trainingStreak.currentStreak} training days in a row. Plan a recovery session so you can keep the streak going.`
        : "Session logged. A short recovery or mobility session tomorrow helps you come back fresh.";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" width="100%" height="100%">
            <Defs>
              <LinearGradient id="wc" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#8b5cf6" />
                <Stop offset="1" stopColor="#3b82f6" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#wc)" />
          </Svg>
          <Text style={styles.title}>Workout Complete!</Text>
          <Text style={styles.subtitle}>{workoutName}</Text>
        </View>

        <View style={styles.body}>
          {isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : isLoading || !data ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Tile label="DURATION" value={data.durationMinutes !== null ? `${data.durationMinutes}m` : "-"} />
                <Tile label="VOLUME" value={vol(data.totalVolumeKg)} />
                <Tile label="SETS" value={String(data.totalSets)} />
              </View>

              <Text style={styles.section}>Personal Records</Text>
              {data.newPersonalRecords.length > 0 ? (
                <View style={{ gap: spacing.sm }}>
                  {data.newPersonalRecords.map((pr) => (
                    <Card key={pr.exerciseId} style={styles.rowCard}>
                      <Icon name="trophy" size={18} color={colors.warning} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>
                          Personal Record · {pr.exerciseName}
                        </Text>
                        <Text style={{ color: colors.textMuted, ...typography.meta }}>
                          {kgToDisplay(pr.weightKg, unit)}
                          {unit} × {pr.reps} reps
                        </Text>
                      </View>
                    </Card>
                  ))}
                </View>
              ) : (
                <Card style={styles.rowCard}>
                  <Icon name="trophy" size={18} color={colors.textMuted} />
                  <Text style={{ color: colors.textSecondary, flex: 1 }}>No new personal records this session.</Text>
                </Card>
              )}

              <Text style={styles.section}>Heart Rate Zone Distribution</Text>
              <Card style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: "row", gap: 3 }}>
                  {[colors.border, colors.border, colors.border, colors.border, colors.border].map((c, i) => (
                    <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c }} />
                  ))}
                </View>
                <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                  No heart-rate data for this session. Connect a wearable in Recover to see time in each zone.
                </Text>
              </Card>

              {data.phases.length > 0 ? (
                <>
                  <Text style={styles.section}>Workout Phase Breakdown</Text>
                  <View style={{ gap: spacing.sm }}>
                    {data.phases.map((p, i) => (
                      <Card key={p.phase} style={[styles.rowCard, { justifyContent: "space-between" }]}>
                        <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, flex: 1 }}>
                          {i + 1}. {PHASE_LABEL[p.phase]}
                        </Text>
                        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 }}>
                          {p.sets} {p.sets === 1 ? "set" : "sets"}
                          {p.volumeKg > 0 ? ` · ${vol(p.volumeKg)}` : ""}
                        </Text>
                      </Card>
                    ))}
                  </View>
                </>
              ) : null}

              {data.trainingStreak.currentStreak > 0 ? (
                <Card style={styles.rowCard}>
                  <Icon name="flame" size={18} color={colors.orange} />
                  <Text style={{ color: colors.textSecondary, flex: 1 }}>
                    Training streak: {data.trainingStreak.currentStreak} day{data.trainingStreak.currentStreak === 1 ? "" : "s"} (longest{" "}
                    {data.trainingStreak.longestStreak})
                  </Text>
                </Card>
              ) : null}

              {insight ? (
                <Card style={{ borderColor: colors.aiBorder, backgroundColor: colors.aiSurface, gap: spacing.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="sparkles" size={13} color={colors.aiAccent} />
                    <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6 }}>23PRIMEFIT INSIGHT</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>{insight}</Text>
                  <Pressable
                    onPress={() => tabs.navigate("Recover")}
                    accessibilityRole="button"
                    style={{ alignSelf: "flex-start", backgroundColor: colors.aiAccentSoft, borderRadius: radius.xs, paddingHorizontal: 10, paddingVertical: 5 }}
                  >
                    <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodySemi, fontSize: 12 }}>Schedule Recovery</Text>
                  </Pressable>
                </Card>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Back to Training" onPress={() => navigation.popToTop()} />
        <Pressable
          onPress={() => navigation.navigate("SessionSets", { sessionId, workoutName })}
          accessibilityRole="button"
          style={{ alignItems: "center", paddingTop: spacing.sm }}
        >
          <Text style={{ color: colors.textSecondary, ...typography.label }}>Review sets</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.xs }}>
      <Text style={{ color: colors.textMuted, ...typography.caption, letterSpacing: 0.6 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 17, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center", paddingBottom: spacing.lg },
  hero: {
    overflow: "hidden",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: "center",
    paddingTop: spacing.xl + spacing.sm,
    paddingBottom: spacing.xl,
    paddingHorizontal: layout.screenPadding,
  },
  title: { color: "#fff", fontFamily: fonts.displayBold, fontSize: 28, letterSpacing: -0.4, textAlign: "center" },
  subtitle: { color: "rgba(255,255,255,0.7)", fontFamily: fonts.body, fontSize: 14, marginTop: 4, textAlign: "center" },
  body: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.md, gap: spacing.md },
  section: { color: colors.textPrimary, ...typography.h3, marginTop: spacing.xs },
  rowCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md - 2 },
  footer: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
});
