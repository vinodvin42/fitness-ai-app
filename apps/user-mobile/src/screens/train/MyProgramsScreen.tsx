import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MyProgram } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { fetchMyPrograms } from "../../api/programPurchases";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "MyPrograms">;

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });

/** "Jan - Mar 2026" / "Mar 2026" / "Oct 2025 - Jan 2026" from real session dates. */
function dateRange(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso) return "Completed";
  const s = new Date(startIso);
  const e = new Date(endIso ?? startIso);
  const sm = MONTH.format(s);
  const em = MONTH.format(e);
  if (s.getFullYear() === e.getFullYear()) return sm === em ? `${sm} ${e.getFullYear()}` : `${sm} - ${em} ${e.getFullYear()}`;
  return `${sm} ${s.getFullYear()} - ${em} ${e.getFullYear()}`;
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ color: colors.textSecondary, ...typography.label }}>{title}</Text>
      <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>{count}</Text>
      </View>
    </View>
  );
}

function ProgramCard({ item, onPress }: { item: MyProgram; onPress: () => void }) {
  const done = item.status === "completed";
  const percent = item.totalWorkouts > 0 ? Math.round((item.completedWorkouts / item.totalWorkouts) * 100) : 0;
  const tone = done ? colors.success : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.program.name}, ${done ? "completed" : "active"}, ${percent} percent`}
      style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: tone, alignItems: "center", justifyContent: "center" }}>
          {done ? <Icon name="check" size={20} color={colors.textOnAccent} strokeWidth={3} /> : <Icon name="dumbbell" size={18} color={colors.textOnAccent} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }} numberOfLines={1}>
            {item.program.name}
          </Text>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            {done
              ? dateRange(item.startedAt, item.lastCompletedAt)
              : item.weekNumber
                ? `Week ${item.weekNumber} of ${item.program.durationWeeks}`
                : "Not started yet"}
          </Text>
        </View>
        {!done ? (
          <View style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 10 }}>Active</Text>
          </View>
        ) : null}
        <Icon name="chevron-right" size={16} color={colors.textMuted} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>{done ? "Completed" : "Overall Progress"}</Text>
        <Text style={{ color: tone, fontFamily: fonts.bodyBold, fontSize: 12 }}>{percent}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${percent}%`, backgroundColor: tone }} />
      </View>
    </Pressable>
  );
}

/**
 * My Programs (Figma Programs 04). A program only shows up here once it's
 * "mine": purchased (priced programs) or actually started (free ones) - see
 * programPurchases.service.ts's listMyPrograms(). "Completed" means every
 * workout in the program has at least one completed WorkoutSession. Active
 * cards show the program week (from the first session) and real
 * completed/total workout progress; completed cards show the month range
 * of the first and last real sessions. Tapping goes to Program Progress
 * (active) or Program Complete (finished).
 */
export function MyProgramsScreen({ navigation }: Props) {
  const { data: myPrograms, isLoading, isError, refetch } = useQuery({
    queryKey: ["programs", "mine"],
    queryFn: fetchMyPrograms,
  });

  const active = (myPrograms ?? []).filter((p) => p.status === "active");
  const completed = (myPrograms ?? []).filter((p) => p.status === "completed");
  const open = (item: MyProgram) =>
    navigation.navigate(item.status === "completed" ? "ProgramCompletion" : "ProgramProgress", { programId: item.program.id });

  return (
    <ScreenContainer title="My Programs">
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (myPrograms ?? []).length === 0 ? (
        <EmptyState title="No programs yet" subtitle="You haven't started or purchased any programs yet — browse Programs on the Train tab." />
      ) : (
        <>
          <SectionHeader title="Active Programs" count={active.length} />
          {active.length === 0 ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>No active programs right now.</Text>
          ) : (
            active.map((item) => <ProgramCard key={item.program.id} item={item} onPress={() => open(item)} />)
          )}
          <SectionHeader title="Completed Programs" count={completed.length} />
          {completed.length === 0 ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Programs you finish will show up here.</Text>
          ) : (
            completed.map((item) => <ProgramCard key={item.program.id} item={item} onPress={() => open(item)} />)
          )}
        </>
      )}

      <Pressable
        onPress={() => navigation.navigate("ProgramsMarketplace")}
        accessibilityRole="button"
        accessibilityLabel="Browse More Programs"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 14,
          marginTop: spacing.sm,
        }}
      >
        <Icon name="plus" size={16} color={colors.textPrimary} />
        <Text style={{ color: colors.textPrimary, ...typography.label }}>Browse More Programs</Text>
      </Pressable>
    </ScreenContainer>
  );
}
