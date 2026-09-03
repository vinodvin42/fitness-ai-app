import React, { useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { TimelineEventType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { fetchTimeline } from "../../api/timeline";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "TimelineReport">;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BADGE_LABEL: Record<TimelineEventType, string> = {
  pr: "PRs",
  milestone: "Milestones",
  program_complete: "Programs Completed",
};

/**
 * Timeline Report (docs/mobile/03-screen-inventory.md §G) — a summary
 * rollup for one year: totals by type and a month-by-month breakdown, all
 * computed client-side from the same ["timeline"] data Overview/Month use
 * — no separate reporting endpoint needed since there's nothing here that
 * isn't already in the full event list.
 */
export function TimelineReportScreen({ route }: Props) {
  const { year } = route.params;
  const { data: events, isLoading, isError, refetch } = useQuery({ queryKey: ["timeline"], queryFn: fetchTimeline });

  const eventsThisYear = useMemo(
    () => (events ?? []).filter((e) => new Date(e.occurredAt).getFullYear() === year),
    [events, year],
  );

  const countsByType = useMemo(() => {
    const counts: Record<TimelineEventType, number> = { pr: 0, milestone: 0, program_complete: 0 };
    for (const event of eventsThisYear) counts[event.type] += 1;
    return counts;
  }, [eventsThisYear]);

  const countsByMonth = useMemo(() => {
    const counts = new Array(12).fill(0);
    for (const event of eventsThisYear) counts[new Date(event.occurredAt).getMonth()] += 1;
    return counts;
  }, [eventsThisYear]);

  if (isLoading) {
    return (
      <ScreenContainer title={`${year} Report`}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError) {
    return (
      <ScreenContainer title={`${year} Report`}>
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={`${year} Report`}>
      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h1 }}>{eventsThisYear.length}</Text>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
          milestone{eventsThisYear.length === 1 ? "" : "s"} in {year}
        </Text>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        {(Object.keys(BADGE_LABEL) as TimelineEventType[]).map((type) => (
          <View key={type} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}>
            <Text style={{ color: colors.textSecondary }}>{BADGE_LABEL[type]}</Text>
            <Text style={{ color: colors.textPrimary }}>{countsByType[type]}</Text>
          </View>
        ))}
      </Card>

      <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>By month</Text>
      <Card>
        {MONTH_NAMES.map((name, i) => (
          <View
            key={name}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingVertical: spacing.xs,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <Text style={{ color: colors.textSecondary }}>{name}</Text>
            <Text style={{ color: countsByMonth[i] > 0 ? colors.textPrimary : colors.textMuted }}>{countsByMonth[i]}</Text>
          </View>
        ))}
      </Card>
    </ScreenContainer>
  );
}
