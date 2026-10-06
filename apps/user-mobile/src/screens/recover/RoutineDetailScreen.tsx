import React from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { EmptyState } from "../../components/EmptyState";
import { getRoutine, routineSeconds } from "../../content/recover";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { ActionButton, PracticeArt, RecoverShell, SafetyCard, SectionLabel } from "./parts";

type Props = NativeStackScreenProps<RecoverStackParamList, "RoutineDetail">;

function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          padding: spacing.md,
          gap: 6,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function NumberBadge({ n }: { n: number }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: colors.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.accent, fontFamily: fonts.bodySemi, fontSize: 11 }}>{n}</Text>
    </View>
  );
}

/** Recover 07 (Gentle Yoga overview) / 10 (Shoulder & hamstring mobility) - one screen driven by the routine's kind. */
export function RoutineDetailScreen({ navigation, route }: Props) {
  const routine = getRoutine(route.params.routineId);

  if (!routine) {
    return (
      <RecoverShell title="Routine" onBack={() => navigation.goBack()}>
        <EmptyState title="Routine not found" actionLabel="Back to library" onAction={() => navigation.navigate("YogaLibrary")} />
      </RecoverShell>
    );
  }

  const minutes = Math.round(routineSeconds(routine) / 60);
  const mobility = routine.kind === "mobility";
  const cta =
    routine.kind === "mobility" ? "Start guided routine" : routine.kind === "mindful" ? `Start ${minutes}-minute practice` : `Start ${minutes}-minute session`;

  return (
    <RecoverShell
      title={mobility ? "Shoulder & hamstring" : routine.title}
      subtitle={routine.overviewLabel}
      onBack={() => navigation.goBack()}
      footer={
        <ActionButton
          label={cta}
          icon="play"
          onPress={() => navigation.navigate("GuidedSession", { routineId: routine.id })}
          style={{ height: 50 }}
        />
      }
    >
      {mobility ? (
        <Panel style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Move within your comfort zone</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>You&apos;ll need {routine.needs.charAt(0).toLowerCase()}{routine.needs.slice(1)}</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            No bouncing or forced stretches. These are gentle movements, not injury treatment.
          </Text>
        </Panel>
      ) : (
        <>
          <PracticeArt height={170} icon={routine.kind === "mindful" ? "brain" : "flower"} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {[
              ["Duration", `${minutes} min`],
              ["Level", routine.level],
              ["Pace", routine.pace],
            ].map(([k, v]) => (
              <Panel key={k} style={{ flex: 1, padding: spacing.sm + 2, gap: 2 }}>
                <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 10 }}>{k}</Text>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{v}</Text>
              </Panel>
            ))}
          </View>
          <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 12 }}>{routine.description}</Text>
          <Panel>
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 13 }}>What you&apos;ll need</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>{routine.needs}</Text>
          </Panel>
        </>
      )}

      <SectionLabel>{mobility ? "Step-by-step routine" : "Your sequence"}</SectionLabel>
      {mobility ? (
        routine.steps.map((s, i) => (
          <Panel key={s.title} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
              <NumberBadge n={i + 1} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{s.title}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>
                  {Math.round(s.seconds / 60)} min{s.note ? ` · ${s.note}` : ""}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>{s.instruction}</Text>
            {s.easier ? (
              <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>Easier option: {s.easier}</Text>
            ) : null}
          </Panel>
        ))
      ) : (
        <Panel style={{ gap: spacing.md }}>
          {routine.steps.map((s, i) => (
            <View key={s.title} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
              <NumberBadge n={i + 1} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{s.title}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{s.summary}</Text>
              </View>
              <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{Math.round(s.seconds / 60)} min</Text>
            </View>
          ))}
        </Panel>
      )}

      <SafetyCard title={routine.safetyTitle} body={routine.safetyBody} />
    </RecoverShell>
  );
}
