import React from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Icon } from "../../components/Icon";
import { routineSeconds } from "../../content/recover";
import { YOGA_PROGRAMS } from "../../content/yogaFoundations";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { PracticeArt, RecoverShell, SafetyCard, SectionLabel } from "./parts";

type Props = NativeStackScreenProps<RecoverStackParamList, "YogaProgram">;

const INCLUDES = [
  "Timed, step-by-step guidance for every pose",
  "An easier option for most poses",
  "Works with a mat; a cushion, wall or chair helps",
];

/**
 * A bundled yoga program (Figma Train 19/20; content/yogaFoundations.ts): the
 * week-by-week plan, each session opening the existing routine overview and
 * guided timer. There is no video, download or price — those Figma parts need
 * content, hosting and pricing decisions that don't exist yet. A draft program
 * says so plainly.
 */
export function YogaProgramScreen({ navigation, route }: Props) {
  const program = YOGA_PROGRAMS.find((p) => p.id === route.params.programId);

  if (!program) {
    return (
      <RecoverShell title="Yoga program" onBack={() => navigation.goBack()}>
        <Text style={{ color: colors.textSecondary, ...typography.body }}>This program isn't available.</Text>
      </RecoverShell>
    );
  }

  const facts = [
    { value: String(program.weeks.length), label: "weeks" },
    { value: String(program.daysPerWeek), label: "days a week" },
    { value: program.minutesLabel, label: "min a session" },
  ];

  return (
    <RecoverShell title={program.title} subtitle={`Yoga program · ${program.level}`} onBack={() => navigation.goBack()}>
      {program.reviewStatus === "draft" ? (
        <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft, padding: spacing.md, gap: 2 }}>
          <Text style={{ color: colors.warningText, fontFamily: fonts.bodyBold, fontSize: 13 }}>DRAFT · NOT YET REVIEWED</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>
            Waiting for review by a qualified yoga teacher. Only shown in development builds.
          </Text>
        </View>
      ) : null}

      <PracticeArt height={140} icon="flower" />
      <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14, lineHeight: 20 }}>{program.description}</Text>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {facts.map((f) => (
          <View key={f.label} style={{ flex: 1, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, alignItems: "center" }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18 }}>{f.value}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{f.label}</Text>
          </View>
        ))}
      </View>

      <SectionLabel>Week by week</SectionLabel>
      {program.weeks.map((w) => (
        <View key={w.week} style={{ borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm }}>
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.accentText, ...typography.caption, letterSpacing: 0.6 }}>WEEK {w.week}</Text>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 16 }}>{w.title}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>{w.focus}</Text>
          </View>
          {w.sessions.map((s, i) => (
            <Pressable
              key={s.id}
              onPress={() => navigation.navigate("RoutineDetail", { routineId: s.id })}
              accessibilityRole="button"
              accessibilityLabel={`Week ${w.week}, session ${i + 1}: ${s.title}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: spacing.sm,
              }}
            >
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.accentText, fontFamily: fonts.bodyBold, fontSize: 13 }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }} numberOfLines={1}>
                  {s.title.replace(/^Week \d+ · Session \d+: /, "")}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {Math.round(routineSeconds(s) / 60)} min · {s.steps.length} poses
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      ))}

      <SectionLabel>Every session includes</SectionLabel>
      {INCLUDES.map((line) => (
        <View key={line} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Icon name="check" size={14} color={colors.success} />
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>{line}</Text>
        </View>
      ))}

      <SafetyCard title={program.safetyTitle} body={program.safetyBody} />
      <Text style={{ color: colors.textMuted, ...typography.meta }}>Needs: {program.needs}</Text>
    </RecoverShell>
  );
}
