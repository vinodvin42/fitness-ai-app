import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { fetchSessionSummary } from "../../api/workoutSessions";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "WorkoutComplete">;

/**
 * Workout Complete (trn-10) — docs/mobile/03-screen-inventory.md §C. Phase 1
 * shipped a static confirmation; 19 Aug 2026 this became real: a session
 * stats card (sets/volume/duration, same calc as Workout History), a real
 * "New Personal Records" card (this session's best-per-exercise beating
 * this user's prior best, not just "is currently a PR" — only shown when
 * non-empty, so a normal session without a new PR doesn't show an empty
 * celebration card) via `GET /workout-sessions/:id/summary`, and the
 * user's real current training streak (reusing Streak Tracker's data, §F,
 * gap §29). Not built: a heart-rate distribution chart (needs wearable
 * data, gap §13/§E).
 */
export function WorkoutCompleteScreen({ route, navigation }: Props) {
  const { sessionId, workoutName } = route.params;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["workoutSessions", sessionId, "summary"],
    queryFn: () => fetchSessionSummary(sessionId),
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.badge}>
          <Icon name="trophy" size={44} color={colors.success} strokeWidth={2} />
        </View>
        <Text style={styles.title}>Workout Complete!</Text>
        <Card style={styles.card}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{workoutName}</Text>
          <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>Nice work — logged and saved.</Text>
        </Card>

        {isError ? (
          <ErrorState style={styles.card} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
        ) : (
          <>
            <Card style={styles.card}>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <StatTile label="Sets" value={String(data.totalSets)} />
                <StatTile label="Volume" value={`${Math.round(data.totalVolumeKg)}kg`} />
                <StatTile label="Duration" value={data.durationMinutes !== null ? `${data.durationMinutes}m` : "—"} />
              </View>
            </Card>

            <Card style={styles.card}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Icon name="flame" size={18} color={colors.orange} />
                <Text style={{ color: colors.textSecondary }}>Training streak</Text>
              </View>
              <Text style={{ color: colors.textPrimary, ...typography.metricLarge, marginTop: spacing.xs }}>
                {data.trainingStreak.currentStreak}{" "}
                <Text style={{ ...typography.h2, color: colors.textMuted }}>
                  {data.trainingStreak.currentStreak === 1 ? "day" : "days"}
                </Text>
              </Text>
              <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
                Longest: {data.trainingStreak.longestStreak} day{data.trainingStreak.longestStreak === 1 ? "" : "s"}
              </Text>
            </Card>

            {data.newPersonalRecords.length > 0 ? (
              <Card style={styles.card}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
                  <Icon name="trophy" size={18} color={colors.warning} />
                  <Text style={{ color: colors.textPrimary, ...typography.h2 }}>New Personal Records</Text>
                </View>
                {data.newPersonalRecords.map((pr) => (
                  <View
                    key={pr.exerciseId}
                    style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}
                  >
                    <Text style={{ color: colors.textPrimary }}>{pr.exerciseName}</Text>
                    <Text style={{ color: colors.success }}>
                      {pr.weightKg}kg × {pr.reps}
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Back to Train" onPress={() => navigation.popToTop()} />
      </View>
    </SafeAreaView>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: colors.accent, fontSize: 20, fontFamily: fonts.mono }}>{value}</Text>
      <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { ...typography.display, color: colors.textPrimary, marginBottom: spacing.sm },
  card: { width: "100%" },
  footer: { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center", paddingHorizontal: layout.screenPadding, paddingVertical: spacing.md },
});
