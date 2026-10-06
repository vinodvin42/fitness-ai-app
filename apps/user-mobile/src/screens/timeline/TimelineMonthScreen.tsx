import React, { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchTimelineMonth } from "../../api/timeline";
import { fetchProgressPhotos } from "../../api/progress";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "../../lib/timelineFormat";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "TimelineMonth">;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Month detail (Figma Progress 09): one month's real sessions, average sleep,
 * the weekdays you trained, and that month's milestones with a Measured /
 * Estimated tag. Progress photos taken that month are shown as thumbnails.
 * (Coach comments from the frame are not shown - milestones carry no coach
 * annotations in this build.) Average sleep needs at least 3 logged nights.
 */
export function TimelineMonthScreen({ route, navigation }: Props) {
  const now = new Date();
  const [year, setYear] = useState(route.params?.year ?? now.getFullYear());
  const [month, setMonth] = useState(route.params?.month ?? now.getMonth());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["timeline", "month", year, month],
    queryFn: () => fetchTimelineMonth(year, month),
  });
  const photos = useQuery({ queryKey: ["progressPhotos"], queryFn: fetchProgressPhotos });

  const goTo = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };
  const shortMonth = (delta: number) => MONTH_NAMES[new Date(year, month + delta, 1).getMonth()].slice(0, 3);

  const monthPhotos = (photos.data ?? []).filter((p) => {
    const d = new Date(p.takenAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  // Which weekdays (Mon-first) had at least one session this month.
  const trained = new Set<number>();
  for (const d of data?.activeDates ?? []) trained.add((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7);

  return (
    <ScreenContainer
      title={`${MONTH_NAMES[month]} ${year}`}
      subtitle="Chronological Monthly Milestone Detail"
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Pressable onPress={() => goTo(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous month">
            <Icon name="arrow-left" size={18} color={colors.textSecondary} />
          </Pressable>
          <Text style={{ color: colors.textSecondary, ...typography.label }}>{shortMonth(0)}</Text>
          <Pressable onPress={() => goTo(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next month">
            <Icon name="chevron-right" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      }
    >
      <BackButton onPress={() => navigation.goBack()} />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <SkeletonCard lines={4} />
      ) : (
        <>
          {data.insight ? (
            <Card style={{ flexDirection: "row", gap: spacing.sm, borderColor: colors.aiBorder, backgroundColor: colors.aiSurface }}>
              <Icon name="sparkles" size={14} color={colors.aiAccent} />
              <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 13, lineHeight: 19, flex: 1 }}>
                {MONTH_NAMES[month]}: {data.insight}
              </Text>
            </Card>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.sm }}>
              <Text style={{ color: colors.textMuted, ...typography.caption }}>Workouts</Text>
              <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 14 }}>
                {data.workouts} {data.workouts === 1 ? "session" : "sessions"}
              </Text>
            </View>
            {data.avgSleepHours != null ? (
              <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.sm }}>
                <Text style={{ color: colors.textMuted, ...typography.caption }}>Avg Sleep</Text>
                <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 14 }}>{data.avgSleepHours}h / night</Text>
              </View>
            ) : null}
          </View>

          <Card style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, ...typography.label }}>Consistency Calendar</Text>
            <View style={{ flexDirection: "row" }}>
              {WEEKDAYS.map((d, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                  <Text style={{ color: colors.textMuted, ...typography.caption }}>{d}</Text>
                  <View
                    style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: trained.has(i) ? colors.accent : colors.surfaceHigh }}
                    accessibilityLabel={`${trained.has(i) ? "Trained" : "No session"} on this weekday`}
                  />
                </View>
              ))}
            </View>
            <Text style={{ color: colors.textMuted, ...typography.caption }}>Weekdays with at least one logged session this month.</Text>
          </Card>

          <Text style={{ color: colors.textSecondary, ...typography.label }}>Monthly Milestones</Text>
          {data.events.length === 0 ? (
            <EmptyState title="No milestones this month" subtitle="Milestones appear here when you hit personal records, log weight changes or reach streaks." />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {data.events.map((e) => (
                <Pressable key={e.id} onPress={() => navigation.navigate("TimelineEvent", { event: e })} accessibilityRole="button" accessibilityLabel={e.title}>
                  <Card style={{ gap: 4, paddingVertical: spacing.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: CATEGORY_COLOR[e.category] }} />
                      <Text style={{ color: colors.textMuted, ...typography.caption, flex: 1 }}>
                        {new Date(e.occurredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {CATEGORY_LABEL[e.category]}
                      </Text>
                      <Text
                        style={{
                          color: e.evidence === "measured" ? colors.success : colors.warning,
                          backgroundColor: e.evidence === "measured" ? colors.successSoft : colors.warningSoft,
                          ...typography.caption,
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                          borderRadius: 6,
                          overflow: "hidden",
                        }}
                      >
                        {e.evidence === "measured" ? "Measured" : "Estimated"}
                      </Text>
                    </View>
                    <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 14 }}>{e.title}</Text>
                    <Text style={{ color: colors.textSecondary, ...typography.meta }}>{e.detail}</Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          )}

          {monthPhotos.length > 0 ? (
            <Card style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textSecondary, ...typography.label }}>Progress photos</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {monthPhotos.slice(0, 4).map((p) => (
                  <Image key={p.id} source={{ uri: p.imageData }} style={{ width: 64, height: 76, borderRadius: radius.sm }} />
                ))}
              </View>
            </Card>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}
