import React, { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon, IconName } from "../../components/Icon";
import { ProgressRing } from "../../components/ProgressRing";
import { AIBanner } from "../../components/AIBanner";
import { useAuth } from "../../context/AuthContext";
import { fetchTodayWaterLogs, logWater } from "../../api/nutrition";
import { fetchWorkoutHistory } from "../../api/workoutSessions";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MainTabsParamList } from "../../navigation/MainTabs";

type Props = BottomTabScreenProps<MainTabsParamList, "Today">;

const WATER_GOAL_GLASSES = 8; // same placeholder as FuelScreen's own — see gap §25

function isToday(isoDate: string): boolean {
  return new Date(isoDate).toDateString() === new Date().toDateString();
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/**
 * Today / Home — docs/mobile/03-screen-inventory.md §B. 31 Aug 2026 design
 * polish: real Lucide icons, a hydration ProgressRing, an AI daily-brief
 * banner, and icon quick-links — the card content and data wiring
 * (WaterLog / in-progress WorkoutSession / cross-tab deep link) are
 * unchanged from the functional build. See the git history / prior comment
 * for the feature-level notes; readiness-score ring still awaits wearable
 * data (§E).
 */
export function TodayScreen({ navigation }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: waterLogs } = useQuery({ queryKey: ["waterLogs", "today"], queryFn: fetchTodayWaterLogs });
  const { data: history } = useQuery({ queryKey: ["workoutHistory"], queryFn: fetchWorkoutHistory });
  const [isLoggingWater, setIsLoggingWater] = useState(false);

  const totalGlasses = useMemo(() => (waterLogs ?? []).reduce((sum, w) => sum + w.glasses, 0), [waterLogs]);
  const inProgressToday = useMemo(
    () => (history ?? []).find((h) => h.status === "in_progress" && isToday(h.startedAt)),
    [history],
  );

  const onAddGlass = async () => {
    setIsLoggingWater(true);
    try {
      await logWater({ glasses: 1 });
      await queryClient.invalidateQueries({ queryKey: ["waterLogs", "today"] });
    } catch (err) {
      Alert.alert("Couldn't log water", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsLoggingWater(false);
    }
  };

  const firstName = user?.fullName?.split(" ")[0] ?? "there";
  const initials = (user?.fullName ?? "?").slice(0, 1).toUpperCase();

  return (
    <ScreenContainer
      title={`Hey, ${firstName}`}
      subtitle={todayLabel()}
      right={
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.accent, ...typography.h3 }}>{initials}</Text>
        </View>
      }
    >
      <AIBanner
        title="Your AI Coach is ready"
        body="Ask 23Prime AI for training, nutrition, or recovery guidance grounded in your real progress."
        ctaLabel="Open chat"
        onPress={() => navigation.navigate("More", { screen: "AiCoach" })}
      />

      {inProgressToday ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs }}>
            <Icon name="dumbbell" size={18} color={colors.accent} />
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Continue Workout</Text>
          </View>
          <Text style={{ color: colors.textSecondary }}>
            {inProgressToday.workoutName} · {inProgressToday.programName}
          </Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
            {inProgressToday.totalSets} set{inProgressToday.totalSets === 1 ? "" : "s"} logged so far
          </Text>
          <Button
            label="Resume session"
            onPress={() =>
              navigation.navigate("Train", {
                screen: "ActiveWorkout",
                params: { workoutId: inProgressToday.workoutId, sessionId: inProgressToday.id },
              })
            }
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : null}

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <ProgressRing progress={totalGlasses / WATER_GOAL_GLASSES} size={92} strokeWidth={10} color={colors.cyan}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: colors.textPrimary, fontSize: 22, fontFamily: fonts.mono }}>{totalGlasses}</Text>
              <Text style={{ color: colors.textMuted, ...typography.caption }}>of {WATER_GOAL_GLASSES}</Text>
            </View>
          </ProgressRing>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Icon name="droplet" size={18} color={colors.cyan} />
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Hydration</Text>
            </View>
            <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
              {Math.max(0, WATER_GOAL_GLASSES - totalGlasses)} glasses to your goal
            </Text>
            <Button
              label="+1 Glass"
              variant="secondary"
              onPress={onAddGlass}
              loading={isLoggingWater}
              style={{ marginTop: spacing.md, height: 42 }}
            />
          </View>
        </View>
      </Card>

      <View>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Quick links</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <QuickLink icon="dumbbell" label="Train" onPress={() => navigation.navigate("Train")} tint={colors.accent} tintSoft={colors.accentSoft} />
          <QuickLink icon="utensils" label="Fuel" onPress={() => navigation.navigate("Fuel")} tint={colors.success} tintSoft={colors.successSoft} />
          <QuickLink
            icon="heart-pulse"
            label="Recover"
            onPress={() => navigation.navigate("More", { screen: "RecoverHub" })}
            tint={colors.aiAccent}
            tintSoft={colors.aiAccentSoft}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

function QuickLink({
  icon,
  label,
  onPress,
  tint,
  tintSoft,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tint: string;
  tintSoft: string;
}) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Card style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: tintSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={22} color={tint} />
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.label }}>{label}</Text>
      </Card>
    </Pressable>
  );
}
