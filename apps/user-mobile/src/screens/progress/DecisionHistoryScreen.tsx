import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { SkeletonCard } from "../../components/Skeleton";
import { useDailyReviewStore } from "../../lib/dailyReviewStore";
import { HISTORY_DAYS, SUGGESTION_KIND_TITLE, shortDay, type SuggestionDecision } from "../../lib/dailySuggestions";
import { BRAND_NAME } from "../../lib/brand";
import { formatTimeOfDay } from "../../lib/format";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";
import { LearnMoreLink } from "../../components/LearnMoreSheet";

type Props = NativeStackScreenProps<ProgressStackParamList, "DecisionHistory">;
type Filter = "all" | "used" | "skipped";

const sortKey = (d: SuggestionDecision) => d.at ?? `${d.date}T00:00:00`;

/** "Sat 24 Oct · 2:34 PM" (older entries without a time show the day only). */
function when(d: SuggestionDecision): string {
  if (d.at) {
    const t = new Date(d.at);
    return `${shortDay(t)} · ${formatTimeOfDay(t)}`;
  }
  const [y, m, day] = d.date.split("-").map(Number);
  return shortDay(new Date(y, m - 1, day));
}

/**
 * Decision history (Figma progress/12, 24 Oct 2026): every daily-review
 * suggestion the member answered, newest first, with what they chose
 * ("Applied" for Use it, "Kept plan" for Skip) and why it was suggested.
 * Read from the daily-review memory on this phone (owner decision, 18 Oct
 * 2026: suggestions are stored on the device), kept for HISTORY_DAYS days.
 * Figma's professional entries ("Suggested by Sarah Williams") need
 * professional plan changes (C12), which this build doesn't have.
 */
export function DecisionHistoryScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const { ready, decisions } = useDailyReviewStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const all = useMemo(() => [...decisions].sort((a, b) => sortKey(b).localeCompare(sortKey(a))), [decisions]);
  const used = all.filter((d) => d.outcome === "used").length;
  const shown = filter === "all" ? all : all.filter((d) => d.outcome === filter);

  const chip = (f: Filter, label: string) => {
    const selected = f === filter;
    return (
      <Pressable
        key={f}
        onPress={() => setFilter(f)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: selected ? theme.accent : colors.border,
          backgroundColor: selected ? theme.accent : colors.surface,
        }}
      >
        <Text style={{ color: selected ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <ScreenContainer title="Decision history" onBack={() => navigation.goBack()}>
      <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14, lineHeight: 20 }}>
        Every suggestion from your daily review, what you chose, and why it was suggested.
      </Text>
      <LearnMoreLink topic="daily_review" />
      {!ready ? (
        <SkeletonCard lines={3} />
      ) : all.length === 0 ? (
        <EmptyState
          title="No decisions yet"
          subtitle="When today's review suggests something and you tap Use it or Skip, it shows up here."
        />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {chip("all", `All · ${all.length}`)}
            {chip("used", `Applied · ${used}`)}
            {chip("skipped", `Kept plan · ${all.length - used}`)}
          </View>
          {shown.map((d) => {
            const id = `${d.key}|${d.date}`;
            const applied = d.outcome === "used";
            const expanded = open === id;
            return (
              <Card key={id} style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{when(d)}</Text>
                  <View
                    style={{
                      borderRadius: radius.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      backgroundColor: applied ? colors.successSoft : colors.surfaceRaised,
                    }}
                  >
                    <Text style={{ color: applied ? colors.successText : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>
                      {applied ? "Applied" : "Kept plan"}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 15 }}>{d.title ?? SUGGESTION_KIND_TITLE[d.kind]}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  Suggested by ✦ {BRAND_NAME} · you tapped {applied ? "Use it" : "Skip"}
                </Text>
                <Pressable
                  onPress={() => setOpen(expanded ? null : id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  hitSlop={6}
                >
                  <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>
                    {expanded ? "Hide why" : "Why it was suggested ›"}
                  </Text>
                </Pressable>
                {expanded ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                    {d.why ?? "The reason wasn't saved for this older entry."}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </>
      )}
      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginTop: spacing.sm }}>
        <Icon name="info" size={16} color={colors.textMuted} />
        <Text style={{ flex: 1, color: colors.textMuted, ...typography.meta, lineHeight: 18 }}>
          Kept on this phone for {HISTORY_DAYS} days. Nothing here changes your plan.
        </Text>
      </View>
    </ScreenContainer>
  );
}
