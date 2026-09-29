import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MyProgram } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchMyPrograms } from "../../api/programPurchases";
import { colors, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "MyPrograms">;

const STATUS_COLOR: Record<MyProgram["status"], string> = {
  active: colors.accent,
  completed: colors.success,
};

/**
 * My Programs (trn-I.04) — docs/mobile/03-screen-inventory.md §I. A program
 * only shows up here once it's "mine": purchased (priced programs) or
 * actually started (free ones) — see programPurchases.service.ts's
 * listMyPrograms(). "Completed" means every workout in the program has at
 * least one completed WorkoutSession, real data from Phase 1's Training
 * flow, not a separate streak/progress table. Tapping a row goes to
 * Program Progress (active) or Program Completion (finished) — both real
 * screens now, see ProgramProgressScreen/ProgramCompletionScreen. No
 * "browse more" CTA beyond the Button below — Train Dashboard's program
 * list already is the browse surface (see its own header comment on why
 * there's no separate marketplace screen yet).
 */
export function MyProgramsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { data: myPrograms, isLoading, isError, refetch } = useQuery({
    queryKey: ["programs", "mine"],
    queryFn: fetchMyPrograms,
  });

  return (
    <ScreenContainer title={t("workout.mine.title")} scroll={false}>
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={myPrograms ?? []}
          keyExtractor={(item) => item.program.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate(
                  item.status === "completed" ? "ProgramCompletion" : "ProgramProgress",
                  { programId: item.program.id },
                )
              }
            >
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h2, flexShrink: 1 }}>
                    {item.program.name}
                  </Text>
                  <Text style={{ color: STATUS_COLOR[item.status], ...typography.meta }}>
                    {item.status === "completed" ? "Completed" : "Active"}
                  </Text>
                </View>
                <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                  {item.completedWorkouts} of {item.totalWorkouts} workouts complete
                  {item.purchasedAt ? ` · purchased ${new Date(item.purchasedAt).toLocaleDateString()}` : ""}
                </Text>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              title={t("workout.mine.emptyTitle")}
              subtitle={t("workout.mine.emptySubtitle")}
            />
          }
        />
      )}

      <Button
        label={t("workout.mine.browse")}
        variant="secondary"
        onPress={() => navigation.navigate("TrainDashboard")}
        style={{ marginTop: spacing.md }}
      />
    </ScreenContainer>
  );
}
