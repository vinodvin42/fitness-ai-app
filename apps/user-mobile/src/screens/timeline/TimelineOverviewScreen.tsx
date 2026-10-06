import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { TimelineCategory } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchTimeline, fetchTimelineSummary } from "../../api/timeline";
import { BRAND_NAME } from "../../lib/brand";
import { CATEGORY_COLOR, CATEGORY_LABEL, eventShareText, fmtDate, shareText } from "../../lib/timelineFormat";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "TimelineOverview">;

type Filter = "all" | Exclude<TimelineCategory, "life">;
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "strength", label: "Strength" },
  { key: "cardio", label: "Cardio" },
  { key: "body", label: "Body" },
  { key: "health", label: "Health" },
  { key: "recovery", label: "Recovery" },
];

const INITIAL_VISIBLE = 6;

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: 2 }}>
      <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 14 }}>{value}</Text>
    </View>
  );
}

function Tag({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <Text style={{ color, backgroundColor: bg, ...typography.caption, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: "hidden" }}>
      {label}
    </Text>
  );
}

/**
 * Your Life Timeline (Figma Progress 08). Member Since is the account's
 * creation date, Active Time the whole months since then (days when under a
 * month), Milestones the real event count; the insight sentence and the
 * Measured / Estimated chips come from the same logs (GET /timeline/summary).
 * Events are filtered client-side by category.
 */
export function TimelineOverviewScreen({ navigation }: Props) {
  const events = useQuery({ queryKey: ["timeline"], queryFn: fetchTimeline });
  const summary = useQuery({ queryKey: ["timeline", "summary"], queryFn: fetchTimelineSummary });
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(
    () => (events.data ?? []).filter((e) => filter === "all" || e.category === filter),
    [events.data, filter],
  );
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);

  const s = summary.data;
  const activeTime = s ? (s.activeMonths >= 1 ? `${s.activeMonths} ${s.activeMonths === 1 ? "Month" : "Months"}` : `${s.activeDays} ${s.activeDays === 1 ? "Day" : "Days"}`) : "-";

  return (
    <ScreenContainer title="Your Life Timeline" subtitle="Complete health & fitness legacy">
      <BackButton onPress={() => navigation.goBack()} />

      {events.isError ? (
        <ErrorState onRetry={() => events.refetch()} />
      ) : events.isLoading || !events.data ? (
        <SkeletonCard lines={4} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StatTile label="Member Since" value={s ? fmtDate(s.memberSince) : "-"} />
            <StatTile label="Active Time" value={activeTime} />
            <StatTile label="Milestones" value={s ? `${s.milestones} Total` : "-"} />
          </View>

          {s?.insight ? (
            <Card style={{ gap: spacing.sm, borderColor: colors.aiBorder, backgroundColor: colors.aiSurface }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                <Icon name="sparkles" size={14} color={colors.aiAccent} />
                <Text style={{ color: colors.aiAccent, ...typography.caption, letterSpacing: 0.8 }}>{BRAND_NAME.toUpperCase()} JOURNEY INSIGHT</Text>
              </View>
              <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 13, lineHeight: 19 }}>{s.insight}</Text>
              <View style={{ flexDirection: "row", gap: spacing.xs }}>
                {s.insightHasMeasured ? <Tag label="Measured" color={colors.success} bg={colors.successSoft} /> : null}
                {s.insightHasEstimated ? <Tag label="Estimated" color={colors.warning} bg={colors.warningSoft} /> : null}
              </View>
            </Card>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  selected={filter === f.key}
                  onPress={() => {
                    setFilter(f.key);
                    setShowAll(false);
                  }}
                />
              ))}
            </View>
          </ScrollView>

          {filtered.length === 0 ? (
            <EmptyState
              title="No milestones here yet"
              subtitle={filter === "all" ? "Complete a workout or log your weight to start your timeline." : `No ${CATEGORY_LABEL[filter as TimelineCategory].toLowerCase()} milestones yet.`}
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {visible.map((e) => (
                <Card key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm }}>
                  <Pressable
                    onPress={() => navigation.navigate("TimelineEvent", { event: e })}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.title}, ${fmtDate(e.occurredAt)}`}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLOR[e.category] }} />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ color: colors.textMuted, ...typography.caption }}>
                        {fmtDate(e.occurredAt, { month: "short", year: "numeric" })}
                        <Text style={{ color: CATEGORY_COLOR[e.category] }}>{`  ${CATEGORY_LABEL[e.category]}`}</Text>
                      </Text>
                      <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 14 }} numberOfLines={2}>
                        {e.title}
                      </Text>
                      <Text style={{ color: colors.textSecondary, ...typography.meta }} numberOfLines={2}>
                        {e.detail}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => void shareText(eventShareText(e))}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${e.title}`}
                  >
                    <Icon name="share" size={16} color={colors.textMuted} />
                  </Pressable>
                </Card>
              ))}
            </View>
          )}

          {!showAll && filtered.length > INITIAL_VISIBLE ? (
            <Button label="View Full Timeline" onPress={() => setShowAll(true)} />
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label="Monthly View" variant="secondary" onPress={() => navigation.navigate("TimelineMonth", {})} style={{ flex: 1 }} />
            <Button label="Journey Report" variant="secondary" onPress={() => navigation.navigate("TimelineReport")} style={{ flex: 1 }} />
          </View>
        </>
      )}
    </ScreenContainer>
  );
}
