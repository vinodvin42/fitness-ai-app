import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { TimelineEventType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import { Icon, IconName } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchTimeline } from "../../api/timeline";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "TimelineOverview">;

const BADGE_LABEL: Record<TimelineEventType, string> = {
  pr: "PR",
  milestone: "Milestone",
  program_complete: "Program Complete",
};

const BADGE_COLOR: Record<TimelineEventType, string> = {
  pr: colors.warning,
  milestone: colors.accent,
  program_complete: colors.success,
};

const BADGE_ICON: Record<TimelineEventType, IconName> = {
  pr: "trophy",
  milestone: "sparkles",
  program_complete: "check",
};

const BADGE_TONE: Record<TimelineEventType, "warning" | "accent" | "success"> = {
  pr: "warning",
  milestone: "accent",
  program_complete: "success",
};

const BADGE_SOFT: Record<TimelineEventType, string> = {
  pr: colors.warningSoft,
  milestone: colors.accentSoft,
  program_complete: colors.successSoft,
};

/**
 * Timeline Overview (docs/mobile/03-screen-inventory.md §G) — a year
 * selector, a stats ribbon, a legend, and a scrollable spine of real
 * milestone events (see apps/api's timeline.service.ts for what counts as
 * one: PRs, workout-count milestones, program completions). Not built:
 * "Goal Reached" and "VO2 max improvement" badges the design shows — see
 * that file's header comment for why. Gap §4 (is Timeline itself a premium
 * feature?) is unresolved, so this stays ungated for every user rather
 * than guessing.
 */
export function TimelineOverviewScreen({ navigation }: Props) {
  const { data: events, isLoading, isError, refetch } = useQuery({ queryKey: ["timeline"], queryFn: fetchTimeline });
  const currentYear = new Date().getFullYear();

  const years = useMemo(() => {
    const set = new Set<number>((events ?? []).map((e) => new Date(e.occurredAt).getFullYear()));
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [events, currentYear]);

  const [selectedYear, setSelectedYear] = useState(currentYear);

  const eventsThisYear = useMemo(
    () => (events ?? []).filter((e) => new Date(e.occurredAt).getFullYear() === selectedYear),
    [events, selectedYear],
  );

  const countsByType = useMemo(() => {
    const counts: Record<TimelineEventType, number> = { pr: 0, milestone: 0, program_complete: 0 };
    for (const event of eventsThisYear) counts[event.type] += 1;
    return counts;
  }, [eventsThisYear]);

  return (
    <ScreenContainer title="Timeline" scroll={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {years.map((year) => (
            <Chip key={year} label={String(year)} selected={year === selectedYear} onPress={() => setSelectedYear(year)} />
          ))}
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
        <RibbonStat value={countsByType.pr} label="PRs" color={colors.warning} />
        <RibbonStat value={countsByType.milestone} label="Milestones" color={colors.accent} />
        <RibbonStat value={countsByType.program_complete} label="Programs" color={colors.success} />
      </View>

      <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm }}>
        {(Object.keys(BADGE_LABEL) as TimelineEventType[]).map((type) => (
          <View key={type} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BADGE_COLOR[type] }} />
            <Text style={{ color: colors.textMuted, ...typography.meta }}>{BADGE_LABEL[type]}</Text>
          </View>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={eventsThisYear}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate("TimelineEvent", { event: item })}>
              <Card style={{ flexDirection: "row", gap: spacing.md }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    backgroundColor: BADGE_SOFT[item.type],
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={BADGE_ICON[item.type]} size={20} color={BADGE_COLOR[item.type]} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
                    <Text style={{ color: colors.textPrimary, ...typography.h3, flexShrink: 1 }}>{item.title}</Text>
                    <Pill label={BADGE_LABEL[item.type]} tone={BADGE_TONE[item.type]} />
                  </View>
                  <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{item.detail}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.caption, marginTop: spacing.xs }}>
                    {new Date(item.occurredAt).toLocaleDateString()}
                  </Text>
                </View>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No milestones yet"
              subtitle={`Complete a workout or hit a new PR to start your ${selectedYear} timeline.`}
            />
          }
        />
      )}

      <Button
        label="View Month"
        variant="secondary"
        onPress={() => navigation.navigate("TimelineMonth", {})}
        style={{ marginTop: spacing.sm }}
      />
      <Button
        label="View Report"
        variant="secondary"
        onPress={() => navigation.navigate("TimelineReport", { year: selectedYear })}
        style={{ marginTop: spacing.sm }}
      />
    </ScreenContainer>
  );
}

function RibbonStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.md,
      }}
    >
      <Text style={{ color, ...typography.h1 }}>{value}</Text>
      <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
    </View>
  );
}
