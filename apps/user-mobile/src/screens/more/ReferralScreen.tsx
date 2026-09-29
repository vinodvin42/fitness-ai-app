import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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

// Keys, not copy — the array is module-level and a translated string in
// it would freeze the language at import time.
const HOW_IT_WORKS = ["referral.step1", "referral.step2", "referral.step3"];

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
  const { t } = useTranslation();
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
      <ScreenContainer title={t("referral.title")}>
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !data) {
    return (
      <ScreenContainer title={t("referral.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={t("referral.title")}>
      <Card>
        <Text style={{ color: colors.textSecondary }}>{t("referral.yourCode")}</Text>
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
          <Button label={t("referral.share")} onPress={onShare} style={{ flex: 1 }} />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        <Card style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary }}>{t("referral.signups")}</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h1, marginTop: spacing.xs }}>
            {data.referredSignups}
          </Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary }}>{t("referral.monthsEarned")}</Text>
          <Text style={{ color: colors.accent, ...typography.h1, marginTop: spacing.xs }}>
            {data.creditMonths}
          </Text>
        </Card>
      </View>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("referral.rewards")}</Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("referral.youGet")}</Text>
            <Text style={{ color: colors.textPrimary, marginTop: 2 }}>{t("referral.youGetValue")}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t("referral.youGetWhen")}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("referral.friendGets")}</Text>
            <Text style={{ color: colors.textPrimary, marginTop: 2 }}>{t("referral.friendGetsValue")}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t("referral.friendGetsWhen")}</Text>
          </View>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.sm }}>
          {t("referral.earned", { count: data.rewardsEarned })}
        </Text>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("referral.howItWorks")}</Text>
        {HOW_IT_WORKS.map((step, i) => (
          <View key={step} style={{ flexDirection: "row", marginBottom: spacing.xs }}>
            <Text style={{ color: colors.accent, fontFamily: fonts.bodyBold, marginRight: spacing.sm }}>{i + 1}.</Text>
            <Text style={{ color: colors.textSecondary, flex: 1 }}>{t(step)}</Text>
          </View>
        ))}
      </Card>

    </ScreenContainer>
  );
}
