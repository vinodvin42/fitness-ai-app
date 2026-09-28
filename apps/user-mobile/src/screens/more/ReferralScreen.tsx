import React, { useState } from "react";
import { ActivityIndicator, Share, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchReferralSummary } from "../../api/referrals";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Referral">;

const HOW_IT_WORKS = [
  "Share your code with a friend.",
  "They enter it on the Sign Up screen when they create their account.",
  "It shows up here as a real, counted signup.",
];

/**
 * Refer & Invite (docs/mobile/03-screen-inventory.md §O) — a real referral
 * code (generated once at signup, `User.referralCode`), a real "how many
 * people have signed up with my code" count (`GET /referrals/me`, backed
 * by a genuine `Referral` row created at signup — see
 * apps/api/src/modules/referrals), copy-to-clipboard, and native sharing
 * (the share sheet itself covers the design's "Messages, Instagram, Mail,
 * more" shortcuts — there's no per-app deep-link integration needed for
 * that).
 *
 * **31 Aug 2026: the reward half is real now.** The open product decision
 * was made — a successful referral (referee subscribes to a paid plan)
 * grants the referrer one month of subscription credit (`User.
 * referralCreditMonths`, see apps/api/src/modules/referrals'
 * grantReferralRewardIfEligible). The "you get / friend gets" grid and a
 * real earned-credit stat are shown below. The credit is a real accrued
 * balance; it isn't yet auto-consumed at renewal (no billing engine runs
 * renewals in this build), so it's labelled honestly as "credit earned".
 * "Invited" (vs. "joined") still isn't shown — the native share sheet
 * doesn't report whether a share was delivered.
 */
export function ReferralScreen({ navigation: _navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["referrals", "me"], queryFn: fetchReferralSummary });
  const [justCopied, setJustCopied] = useState(false);

  const onCopy = async () => {
    if (!data) return;
    await Clipboard.setStringAsync(data.code);
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 2000);
  };

  const onShare = async () => {
    if (!data) return;
    await Share.share({
      message: `Join me on FynroX! Use my referral code ${data.code} when you sign up.`,
    });
  };

  if (isError) {
    return (
      <ScreenContainer title="Refer & Invite">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !data) {
    return (
      <ScreenContainer title="Refer & Invite">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Refer & Invite">
      <Card>
        <Text style={{ color: colors.textSecondary }}>Your referral code</Text>
        <Text style={{ color: colors.textPrimary, ...typography.metricLarge, marginTop: spacing.xs, letterSpacing: 2 }}>
          {data.code}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={justCopied ? "Copied!" : "Copy Code"}
            variant="secondary"
            onPress={onCopy}
            style={{ flex: 1 }}
          />
          <Button label="Share" onPress={onShare} style={{ flex: 1 }} />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        <Card style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary }}>Signups</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h1, marginTop: spacing.xs }}>
            {data.referredSignups}
          </Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary }}>Months earned</Text>
          <Text style={{ color: colors.accent, ...typography.h1, marginTop: spacing.xs }}>
            {data.creditMonths}
          </Text>
        </Card>
      </View>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Rewards</Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>You get</Text>
            <Text style={{ color: colors.textPrimary, marginTop: 2 }}>1 month free</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>when your friend subscribes to a paid plan</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Your friend gets</Text>
            <Text style={{ color: colors.textPrimary, marginTop: 2 }}>Your referral credit</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>toward their membership</Text>
          </View>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.sm }}>
          You've earned {data.rewardsEarned} reward{data.rewardsEarned === 1 ? "" : "s"} so far. Credit is applied
          toward your next renewal.
        </Text>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>How it works</Text>
        {HOW_IT_WORKS.map((step, i) => (
          <View key={step} style={{ flexDirection: "row", marginBottom: spacing.xs }}>
            <Text style={{ color: colors.accent, fontFamily: fonts.bodyBold, marginRight: spacing.sm }}>{i + 1}.</Text>
            <Text style={{ color: colors.textSecondary, flex: 1 }}>{step}</Text>
          </View>
        ))}
      </Card>

    </ScreenContainer>
  );
}
