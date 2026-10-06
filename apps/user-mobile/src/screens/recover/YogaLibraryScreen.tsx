import React from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { ListRow } from "../../components/ListRow";
import { Pill } from "../../components/Pill";
import { BREATHING_PATTERNS, GUIDED_ROUTINES, WELLNESS_NOTE, routineSeconds } from "../../content/recover";
import type { RoutineKind } from "../../content/recover";
import type { IconName } from "../../components/Icon";
import { colors, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";

type Props = NativeStackScreenProps<RecoverStackParamList, "YogaLibrary">;

const KIND_ICON: Record<RoutineKind, IconName> = { yoga: "flower", mobility: "activity", mindful: "brain" };
const KIND_LABEL: Record<RoutineKind, string> = { yoga: "Yoga", mobility: "Mobility", mindful: "Mindful" };

/** Recover 06 - Yoga & Mobility Library (bundled content, see src/content/recover.ts). */
export function YogaLibraryScreen({ navigation }: Props) {
  return (
    <ScreenContainer title="Yoga & mobility" subtitle="Guided routines and breathing">
      <BackButton onPress={() => navigation.goBack()} />

      <Text style={{ color: colors.textMuted, ...typography.label }}>ROUTINES</Text>
      <View style={{ gap: spacing.sm }}>
        {GUIDED_ROUTINES.map((r) => (
          <ListRow
            key={r.id}
            icon={KIND_ICON[r.kind]}
            title={r.title}
            subtitle={`${r.subtitle} · ${Math.round(routineSeconds(r) / 60)} min · ${r.steps.length} steps`}
            tint={colors.aiAccent}
            tintSoft={colors.aiAccentSoft}
            right={<Pill label={KIND_LABEL[r.kind]} tone="ai" />}
            onPress={() => navigation.navigate("RoutineDetail", { routineId: r.id })}
          />
        ))}
      </View>

      <Text style={{ color: colors.textMuted, ...typography.label }}>BREATHING</Text>
      <View style={{ gap: spacing.sm }}>
        {BREATHING_PATTERNS.map((p) => (
          <ListRow
            key={p.id}
            icon="wind"
            title={p.name}
            subtitle={`${p.ratio} · ${p.description}`}
            tint={colors.cyan}
            tintSoft="rgba(34,211,238,0.16)"
            onPress={() => navigation.navigate("GuidedBreathing", { patternId: p.id })}
          />
        ))}
      </View>

      <Text style={{ color: colors.textMuted, ...typography.meta }}>{WELLNESS_NOTE}</Text>
    </ScreenContainer>
  );
}
