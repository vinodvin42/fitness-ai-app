import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { BackButton } from "../../components/BackButton";
import { ErrorState } from "../../components/ErrorState";
import { fetchProgramDetail } from "../../api/programs";
import { fetchNextWorkout } from "../../api/plans";
import { usePaymentsConfigured } from "../../lib/useRazorpayPurchase";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ProgramDetail">;

const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;
const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;
const SAMPLE_COUNT = 4;

function MetaChip({ label }: { label: string }) {
  return (
    <View style={{ borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: fonts.bodyMedium }}>{label}</Text>
    </View>
  );
}

function Section({ title, right, children }: { title: string; right?: string; children?: React.ReactNode }) {
  const { colors: theme } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{title}</Text>
        {right ? <Text style={{ color: theme.accent, fontFamily: fonts.bodyBold, fontSize: 12 }}>{right}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Program Detail (Figma Train 03): hero, title + meta chips, curriculum
 * preview, sample workouts, program note, pricing, coaching, "what you
 * receive" and the Buy / Start CTA. Buy opens the Program Checkout screen
 * (Figma Programs 01), which owns the coupon field and the Razorpay order +
 * checkout flow (the server 402s without a verified payment). Everything shown is derived
 * from the real program and its workouts; the Program Note only appears when
 * this is the program the user's active plan is built on (plan rationale).
 * The Coaching card links to the real coach discovery / quote-request flow
 * under More.
 */
export function ProgramDetailScreen({ route, navigation }: Props) {
  const { programId } = route.params;
  const { colors: theme } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const { data: program, isLoading, isError, refetch } = useQuery({
    queryKey: ["program", programId],
    queryFn: () => fetchProgramDetail(programId),
  });
  const nextWorkout = useQuery({ queryKey: ["plans", "current", "nextWorkout"], queryFn: fetchNextWorkout });

  const { configured: paymentsConfigured } = usePaymentsConfigured();

  if (isError) {
    return (
      <ScreenContainer title="Program Detail">
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !program) {
    return (
      <ScreenContainer title="Program Detail">
        <BackButton onPress={() => navigation.goBack()} />
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const needsPurchase = program.priceCents > 0 && !program.purchased;
  const priceLabel = program.priceCents === 0 ? "Free" : `₹${Math.round(program.priceCents / 100).toLocaleString("en-IN")}`;
  const level = program.workouts.reduce<keyof typeof LEVEL_RANK | null>(
    (top, w) => (top === null || LEVEL_RANK[w.intensity] > LEVEL_RANK[top] ? w.intensity : top),
    null,
  );
  const visibleWorkouts = showAll ? program.workouts : program.workouts.slice(0, SAMPLE_COUNT);
  const plan = nextWorkout.data?.plan;
  const planNote = plan && plan.programId === program.id ? plan.rationale : null;
  const parent = navigation.getParent<NavigationProp<MainTabsParamList>>();
  const hasWorkouts = program.workouts.length > 0;
  const receives = [
    ...(hasWorkouts
      ? [
          `${program.workouts.length} guided workouts over ${program.durationWeeks} weeks`,
          "Step-by-step exercise instructions",
          "Set, rep and RPE logging with a rest timer",
        ]
      : []),
    "Progress tracking and a completion summary",
    ...(program.type !== "fitness" ? ["Nutrition guidance"] : []),
  ];
  const firstWorkout = program.workouts[0];

  return (
    <ScreenContainer title="Program Detail">
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
        {program.imageUrl ? (
          <Image source={{ uri: program.imageUrl }} style={{ width: "100%", height: 170, backgroundColor: colors.surfaceRaised }} resizeMode="cover" />
        ) : (
          <View style={{ height: 110, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="dumbbell" size={34} color={theme.accent} />
          </View>
        )}
        <View style={{ padding: spacing.md, gap: 8 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22 }}>{program.name}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>{program.description}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <MetaChip label={`${program.durationWeeks} weeks`} />
            {program.workouts.length > 0 ? <MetaChip label={`${program.workouts.length} workouts`} /> : null}
            {level ? <MetaChip label={LEVEL_LABEL[level]} /> : null}
            {program.purchased && program.priceCents > 0 ? <MetaChip label="Purchased" /> : null}
          </View>
        </View>
      </View>

      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Curriculum Preview</Text>
      <Section title={`Preview the full ${program.durationWeeks}-week curriculum`}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
          {program.workouts.length > 0
            ? `This preview shows the workout structure included in the program: ${program.workouts.length} ${
                program.workouts.length === 1 ? "workout" : "workouts"
              } to repeat and progress through across ${program.durationWeeks} weeks.`
            : `This is a nutrition-focused program running ${program.durationWeeks} weeks. It has no training workouts.`}
        </Text>
      </Section>

      {hasWorkouts ? (
        <>
      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{showAll ? "All Workouts" : "Sample Week Workouts"}</Text>
      <View style={{ gap: spacing.sm }}>
        {visibleWorkouts.map((workout, i) => (
          <Pressable
            key={workout.id}
            onPress={() => navigation.navigate("WorkoutDetail", { workoutId: workout.id })}
            accessibilityRole="button"
            accessibilityLabel={`Preview ${workout.name}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radius.sm,
                backgroundColor: colors.surfaceHigh,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: fonts.bodyBold }}>{`W${i + 1}`}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{workout.name}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>
                {workout.durationMinutes} min · {LEVEL_LABEL[workout.intensity]}
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Preview</Text>
          </Pressable>
        ))}
      </View>
        </>
      ) : null}

      {planNote ? (
        <View style={{ backgroundColor: colors.aiSurface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.aiBorder, padding: spacing.md, gap: 4 }}>
          <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6 }}>PROGRAM NOTE</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 12, lineHeight: 18 }}>{planNote}</Text>
        </View>
      ) : null}

      <Section title="Pricing" right={program.priceCents === 0 ? "Free" : `${priceLabel} one-time`}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
          {program.priceCents === 0
            ? "This program is free. Coaching is available as a separate request."
            : "Buy this program once and own it forever. Coaching is available as a separate request."}
        </Text>
      </Section>

      <Section title="Coaching">
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
          Need personalized guidance? Request coaching and a professional will review your goals, confirm availability, and quote a custom
          fee before payment.
        </Text>
        <Pressable
          onPress={() => parent?.navigate("More", { screen: "CoachDiscovery", params: { serviceType: "fitness" } })}
          accessibilityRole="button"
          accessibilityLabel="Find a coach"
          style={{ alignSelf: "flex-start", marginTop: 4 }}
        >
          <Text style={{ color: theme.accent, fontFamily: fonts.bodyBold, fontSize: 13 }}>Find a coach ›</Text>
        </Pressable>
      </Section>

      <Section title="What you receive">
        <View style={{ gap: 8, marginTop: 2 }}>
          {receives.map((r) => (
            <View key={r} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="check" size={14} color={theme.accent} strokeWidth={3} />
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{r}</Text>
            </View>
          ))}
        </View>
      </Section>

      {needsPurchase ? (
        <>
          {!paymentsConfigured ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Purchases aren't open yet during this pilot — check back soon.</Text>
          ) : null}
          <Button
            label={paymentsConfigured ? `Buy program · ${priceLabel}` : "Coming soon"}
            onPress={() => navigation.navigate("ProgramCheckout", { programId })}
            disabled={!paymentsConfigured}
          />
        </>
      ) : firstWorkout ? (
        <Button label="Start Program" onPress={() => navigation.navigate("WorkoutDetail", { workoutId: firstWorkout.id })} />
      ) : null}
      {program.workouts.length > SAMPLE_COUNT ? (
        <Button label={showAll ? "Show sample week only" : "Preview full curriculum"} variant="secondary" onPress={() => setShowAll((v) => !v)} />
      ) : null}
      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>Coaching is a separate request</Text>

    </ScreenContainer>
  );
}
