import React from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { EmptyState } from "../../components/EmptyState";
import { WELLNESS_NOTE, getRoutine, routineSeconds } from "../../content/recover";
import { formatMmSs } from "../../lib/format";
import { colors, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";

type Props = NativeStackScreenProps<RecoverStackParamList, "RoutineDetail">;

/** Recover 07 (Gentle Yoga) / 10 (Mobility) detail - one screen driven by the routine's `kind`. */
export function RoutineDetailScreen({ navigation, route }: Props) {
  const routine = getRoutine(route.params.routineId);

  if (!routine) {
    return (
      <ScreenContainer title="Routine">
        <BackButton onPress={() => navigation.goBack()} />
        <EmptyState title="Routine not found" actionLabel="Back to library" onAction={() => navigation.navigate("YogaLibrary")} />
      </ScreenContainer>
    );
  }

  const total = routineSeconds(routine);
  const startLabel = routine.kind === "mindful" ? "Start practice" : "Start routine";

  return (
    <ScreenContainer title={routine.title} subtitle={routine.subtitle}>
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        <Pill label={routine.level} tone="ai" />
        <Pill label={`${Math.round(total / 60)} min`} icon="clock" />
        <Pill label={`${routine.steps.length} steps`} />
      </View>
      <Text style={{ color: colors.textSecondary, ...typography.body }}>{routine.description}</Text>

      <Card style={{ gap: spacing.md }}>
        <Text style={{ color: colors.textMuted, ...typography.label }}>WHAT'S IN IT</Text>
        {routine.steps.map((s, i) => (
          <View key={`${s.title}-${i}`} style={{ flexDirection: "row", gap: spacing.md }}>
            <Text style={{ color: colors.aiAccent, ...typography.h3, width: 22 }}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{s.title}</Text>
              <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{s.instruction}</Text>
            </View>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>{formatMmSs(s.seconds)}</Text>
          </View>
        ))}
      </Card>

      <Text style={{ color: colors.textMuted, ...typography.meta }}>{WELLNESS_NOTE}</Text>
      <Button label={startLabel} onPress={() => navigation.navigate("GuidedSession", { routineId: routine.id })} />
    </ScreenContainer>
  );
}
