import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { useToast } from "../../components/Toast";
import { cancelSubscription, fetchCurrentSubscription, fetchPlans, type CancelReason } from "../../api/subscriptions";
import { extractErrorMessage } from "../../lib/apiError";
import { isFreePlan } from "../../lib/planLineup";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "CancelSubscription">;

const REASONS: Array<{ id: CancelReason; label: string }> = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "not_using", label: "Not using it enough" },
  { id: "no_value", label: "Not seeing value" },
  { id: "technical", label: "Technical issues" },
  { id: "break", label: "Taking a break" },
  { id: "other", label: "Other" },
];
const COMMENT_MAX = 500;

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * Cancel subscription (Figma payments/07, 24 Oct 2026), replacing the old
 * confirm alert. Says what changes (the paid plan runs to the end of the
 * period already paid for, then the member is on the free plan, which never
 * ends; bought programs and their data stay), then asks why: optional, saved
 * with the cancellation for the team (POST /subscriptions/cancel { reason,
 * comment }). "Keep my plan" is the primary action.
 */
export function CancelSubscriptionScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useQuery({ queryKey: ["subscriptions", "current"], queryFn: fetchCurrentSubscription });
  const plans = useQuery({ queryKey: ["subscriptions", "plans"], queryFn: fetchPlans });

  if (current.isLoading) {
    return (
      <ScreenContainer title="Cancel subscription">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }
  const sub = current.data;
  if (current.isError || !sub || isFreePlan(sub.plan) || sub.cancelAtPeriodEnd) {
    return (
      <ScreenContainer title="Cancel subscription" onBack={() => navigation.goBack()}>
        {current.isError ? (
          <ErrorState message="Couldn't load your plan." onRetry={() => current.refetch()} />
        ) : (
          <Text style={{ color: colors.textSecondary, ...typography.body }}>
            {sub?.cancelAtPeriodEnd ? "This plan is already set to end. It won't renew." : "There's no paid plan to cancel."}
          </Text>
        )}
      </ScreenContainer>
    );
  }

  const free = (plans.data ?? []).find((p) => isFreePlan(p) && p.billingCycle === "monthly") ?? (plans.data ?? []).find(isFreePlan);
  const endsOn = sub.renewsAt ? longDate(sub.renewsAt) : null;

  const confirm = async () => {
    setBusy(true);
    try {
      await cancelSubscription({ reason: reason ?? undefined, comment: comment.trim() || undefined });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["subscriptions", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["subscriptions", "history"] }),
      ]);
      toast.show(endsOn ? `Cancelled. ${sub.plan.name} stays on until ${endsOn}.` : "Cancelled. Your plan won't renew.", "success");
      navigation.goBack();
    } catch (err) {
      toast.show(extractErrorMessage(err, "Couldn't cancel. Check your connection and try again."), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer title="Cancel subscription" onBack={() => navigation.goBack()}>
      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>What changes if you cancel</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
          {endsOn ? `${sub.plan.name} features end on ${endsOn}.` : `${sub.plan.name} features end when this billing period ends.`}
          {free ? ` After that you're on ${free.name}, which is free and never ends.` : ""} Your data and the programs you bought stay.
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
          {endsOn
            ? `Your billing period stays active until ${endsOn}. You won't be charged again.`
            : "Your billing period stays active until it ends. You won't be charged again."}
        </Text>
      </Card>

      <Text style={{ color: colors.textPrimary, ...typography.h3, marginTop: spacing.sm }}>Why are you leaving?</Text>
      <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: -spacing.xs }}>Optional. It helps us improve.</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {REASONS.map((r) => {
          const selected = reason === r.id;
          return (
            <Pressable
              key={r.id}
              onPress={() => setReason(selected ? null : r.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? theme.accent : colors.border,
                backgroundColor: selected ? theme.accent : colors.surface,
              }}
            >
              <Text style={{ color: selected ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        style={{
          minHeight: 88,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceRaised,
          padding: spacing.sm,
          color: colors.textPrimary,
          textAlignVertical: "top",
        }}
        accessibilityLabel="Additional comments (optional)"
        placeholder="Additional comments (optional)"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={COMMENT_MAX}
        value={comment}
        onChangeText={setComment}
      />

      <Button label="Keep my plan" onPress={() => navigation.goBack()} disabled={busy} style={{ marginTop: spacing.sm }} />
      <Button label="Confirm cancellation" variant="secondary" onPress={confirm} loading={busy} disabled={busy} />
      <Pressable onPress={() => navigation.navigate("DownloadData")} accessibilityRole="link" hitSlop={6}>
        <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", lineHeight: 18 }}>
          Programs you bought aren't affected. You can{" "}
          <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi }}>download your data</Text> any time.
        </Text>
      </Pressable>
    </ScreenContainer>
  );
}
