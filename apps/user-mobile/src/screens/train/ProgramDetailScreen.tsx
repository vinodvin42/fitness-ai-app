import React from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { RazorpayCheckoutModal } from "../../components/RazorpayCheckoutModal";
import { fetchProgramDetail } from "../../api/programs";
import { useRazorpayPurchase, usePaymentsConfigured } from "../../lib/useRazorpayPurchase";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ProgramDetail">;

/**
 * Program Detail (trn-03) — docs/mobile/03-screen-inventory.md §C, plus a
 * Phase 3 addition: a real Purchase card for priced programs (§I Programs
 * Commerce). Not built: the "Add Coach" toggle, weekly breakdown, or
 * benefits checklist — the design's AI-only vs AI+Coach add-on choice needs
 * Coach infra that doesn't exist until Phase 5, see
 * docs/mobile/07-open-questions-gaps.md §15. **20 Aug 2026:** purchasing
 * now routes through a real Razorpay order + hosted Checkout + server-side
 * signature verification (`useRazorpayPurchase`/`RazorpayCheckoutModal`),
 * closing gap §14 — the server itself also enforces this (POST
 * /programs/:id/purchase 402s without a verified payment), this screen's
 * flow is just the honest client-side path to satisfy that. **4 Sep 2026:**
 * a program with a cover photo (`Program.imageUrl`) leads with it as a hero
 * above the summary card; programs without one render exactly as before,
 * starting at the icon tile.
 */
export function ProgramDetailScreen({ route, navigation }: Props) {
  const { programId } = route.params;
  const queryClient = useQueryClient();
  const { data: program, isLoading, isError, refetch } = useQuery({
    queryKey: ["program", programId],
    queryFn: () => fetchProgramDetail(programId),
  });

  const { order, purchase, isPurchasing, onCheckoutSuccess, onCheckoutDismiss } = useRazorpayPurchase({
    onVerified: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["program", programId] }),
        queryClient.invalidateQueries({ queryKey: ["programs", "mine"] }),
      ]),
  });

  // useRazorpayPurchase's purchase() handles its own errors internally
  // (shows its own Alert on failure), so there's no try/catch needed here.
  const onPurchase = () => purchase("program_purchase", programId);
  const { configured: paymentsConfigured } = usePaymentsConfigured();

  if (isError) {
    return (
      <ScreenContainer title="Program">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !program) {
    return (
      <ScreenContainer title="Program">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const needsPurchase = program.priceCents > 0 && !program.purchased;

  return (
    <ScreenContainer title={program.name}>
      {program.imageUrl ? (
        <Image
          source={{ uri: program.imageUrl }}
          style={{
            width: "100%",
            height: 180,
            borderRadius: radius.card,
            backgroundColor: colors.surfaceRaised,
            marginBottom: spacing.md,
          }}
          resizeMode="cover"
        />
      ) : null}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: radius.md,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="dumbbell" size={26} color={colors.accent} />
          </View>
          <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            <Pill label={`${program.durationWeeks} weeks`} icon="calendar" />
            <Pill label={program.type} />
            {program.priceCents === 0 ? (
              <Pill label="Free" tone="success" />
            ) : program.purchased ? (
              <Pill label="Purchased" tone="success" icon="check" />
            ) : (
              <Pill label={`$${(program.priceCents / 100).toFixed(0)}`} tone="accent" />
            )}
          </View>
        </View>
        <Text style={{ color: colors.textSecondary, ...typography.body, marginTop: spacing.md }}>
          {program.description}
        </Text>
      </Card>

      {needsPurchase ? (
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Purchase this program</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
            {paymentsConfigured
              ? `One-time purchase — unlocks every workout in ${program.name}.`
              : "Purchases aren't open yet during this pilot — check back soon."}
          </Text>
          <Button
            label={paymentsConfigured ? `Purchase — $${(program.priceCents / 100).toFixed(2)}` : "Coming soon"}
            onPress={onPurchase}
            loading={isPurchasing}
            disabled={!paymentsConfigured}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : null}

      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>
        Workouts <Text style={{ color: colors.textMuted, ...typography.meta }}>({program.workouts.length})</Text>
      </Text>
      <View style={{ gap: spacing.sm }}>
        {program.workouts.map((workout) => (
          <ListRow
            key={workout.id}
            icon="flame"
            tint={colors.orange}
            tintSoft="rgba(251,146,60,0.16)"
            title={workout.name}
            subtitle={`${workout.durationMinutes} min · ${workout.intensity}`}
            onPress={() => navigation.navigate("WorkoutDetail", { workoutId: workout.id })}
          />
        ))}
        {program.workouts.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>No workouts in this program yet.</Text>
        ) : null}
      </View>

      <RazorpayCheckoutModal order={order} onSuccess={onCheckoutSuccess} onDismiss={onCheckoutDismiss} />
    </ScreenContainer>
  );
}
