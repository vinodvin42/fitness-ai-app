import React, { useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BackButton } from "../../components/BackButton";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { Icon, IconName } from "../../components/Icon";
import { fetchReferralSummary } from "../../api/referrals";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import { BRAND_NAME } from "../../lib/brand";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Referral">;

const STEPS = [
  { title: "Share your code", body: "Send your code or copy it above." },
  { title: "Friend signs up", body: "They enter your code on the Sign Up screen when they join." },
  { title: "Reward added", body: "You get one month of credit after your friend subscribes to a paid plan." },
];

/**
 * Invite Friends (Figma 13 — Referral). Everything shown is real: the code is
 * `User.referralCode`, the stats are counted from `Referral`/`ReferralReward`
 * rows. Not shown because it isn't measurable or doesn't exist: an "Invited"
 * count (the share sheet can't report delivery), a reward for the friend (the
 * backend only rewards the referrer — see referrals.service.ts), and a
 * per-app Instagram share (Instagram has no text-share URL, so it opens the
 * system share sheet like "More").
 */
export function ReferralScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["referrals", "me"], queryFn: fetchReferralSummary });
  const [justCopied, setJustCopied] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const message = data ? `Join me on ${BRAND_NAME}! Use my invite code ${data.code} when you sign up.` : "";

  const onCopy = async () => {
    if (!data) return;
    await Clipboard.setStringAsync(data.code);
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 2000);
  };

  const shareSheet = () => Share.share({ message }).catch(() => undefined);

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      await shareSheet();
    }
  };

  const shortcuts: Array<{ label: string; icon: IconName; tint: string; onPress: () => void }> = [
    { label: "WhatsApp", icon: "message", tint: colors.success, onPress: () => openUrl(`https://wa.me/?text=${encodeURIComponent(message)}`) },
    { label: "Instagram", icon: "share", tint: colors.pink, onPress: shareSheet },
    {
      label: "Messages",
      icon: "mail",
      tint: colors.accent,
      onPress: () => openUrl(`sms:${Platform.OS === "ios" ? "&" : "?"}body=${encodeURIComponent(message)}`),
    },
    { label: "More", icon: "menu", tint: colors.textSecondary, onPress: shareSheet },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.column}>
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>

        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.headline}>Invite friends to {BRAND_NAME}</Text>
              <Text style={styles.sub}>
                When a friend starts a paid plan with your invite code, you get a reward.
              </Text>
              <Text style={styles.sub}>Invite codes are separate from partner codes and never share your data.</Text>
              <Pressable onPress={() => setTermsOpen(true)} accessibilityRole="link" accessibilityLabel="View current referral terms">
                <Text style={styles.link}>View current referral terms</Text>
              </Pressable>

              <View style={styles.row}>
                <View style={styles.rewardCard}>
                  <View style={styles.rewardHead}>
                    <Icon name="user" size={14} color={colors.accent} />
                    <Text style={styles.rewardLabel}>You get</Text>
                  </View>
                  <Text style={styles.rewardValue}>1 month of credit</Text>
                  <Text style={styles.rewardNote}>After their first paid plan</Text>
                </View>
                <View style={styles.rewardCard}>
                  <View style={styles.rewardHead}>
                    <Icon name="users" size={14} color={colors.accent} />
                    <Text style={styles.rewardLabel}>Friend gets</Text>
                  </View>
                  <Text style={styles.rewardValue}>Your invitation</Text>
                  <Text style={styles.rewardNote}>No referral discount yet</Text>
                </View>
              </View>

              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Your Referral Code</Text>
                <View style={styles.codeRow}>
                  <Text style={styles.code} selectable>
                    {data.code}
                  </Text>
                  <Pressable
                    onPress={onCopy}
                    accessibilityRole="button"
                    accessibilityLabel={justCopied ? "Code copied" : "Copy code"}
                    style={styles.copyBtn}
                  >
                    <Text style={styles.copyText}>{justCopied ? "Copied!" : "Copy"}</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Share Instantly</Text>
              <View style={styles.shortcuts}>
                {shortcuts.map((s) => (
                  <Pressable
                    key={s.label}
                    onPress={s.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={`Share via ${s.label}`}
                    style={styles.shortcut}
                  >
                    <View style={styles.shortcutIcon}>
                      <Icon name={s.icon} size={20} color={s.tint} />
                    </View>
                    <Text style={styles.shortcutLabel}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>How It Works</Text>
                {STEPS.map((step, i) => (
                  <View key={step.title} style={styles.step}>
                    <View style={styles.stepNum}>
                      <Text style={styles.stepNumText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                      <Text style={styles.stepBody}>{step.body}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Your Referral Stats</Text>
              <View style={styles.row}>
                <Stat value={data.referredSignups} label="Signed up" />
                <Stat value={data.rewardsEarned} label="Started a paid plan" tint={colors.accent} />
                <Stat value={data.creditMonths} label="Months credit" />
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <Button label="Share Invite Link" onPress={shareSheet} />
            </View>
          </>
        )}
      </View>

      <BottomSheet visible={termsOpen} onClose={() => setTermsOpen(false)} title="Referral terms">
        <Text style={styles.sub}>
          • Your friend enters your invite code when they create their account.{"\n"}
          • When that friend first subscribes to a paid plan, you earn one month of subscription credit.{"\n"}
          • Credit is added to your balance and applied toward your membership; it has no cash value.{"\n"}
          • Invite codes are separate from partner (gym) codes and never share your data.{"\n"}
          • Rewards can change or end; the terms shown here are the ones currently in effect.
        </Text>
      </BottomSheet>
    </SafeAreaView>
  );
}

function Stat({ value, label, tint }: { value: number; label: string; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tint ? { color: tint } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  column: { flex: 1, width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center" },
  topBar: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  scroll: { paddingHorizontal: layout.screenPadding, paddingBottom: spacing.lg, gap: spacing.md },
  headline: { color: colors.textPrimary, ...typography.h1, textAlign: "center", marginTop: spacing.sm },
  sub: { color: colors.textSecondary, ...typography.meta, textAlign: "center" },
  link: { color: colors.textPrimary, ...typography.meta, textAlign: "center", textDecorationLine: "underline" },
  row: { flexDirection: "row", gap: spacing.sm },
  rewardCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  rewardHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  rewardLabel: { color: colors.textMuted, ...typography.caption },
  rewardValue: { color: colors.textPrimary, ...typography.h3, marginTop: 4 },
  rewardNote: { color: colors.textMuted, ...typography.caption },
  codeBox: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  codeLabel: { color: colors.textMuted, ...typography.caption, textAlign: "center" },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 24, letterSpacing: 1.5 },
  copyBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceHigh },
  copyText: { color: colors.accent, ...typography.label },
  sectionLabel: { color: colors.textPrimary, ...typography.label },
  shortcuts: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.sm },
  shortcut: { alignItems: "center", gap: 6, width: 64 },
  shortcutIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutLabel: { color: colors.textMuted, ...typography.caption },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardTitle: { color: colors.textPrimary, ...typography.h3 },
  step: { flexDirection: "row", gap: spacing.md },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 12 },
  stepTitle: { color: colors.textPrimary, ...typography.label },
  stepBody: { color: colors.textMuted, ...typography.caption, marginTop: 2 },
  stat: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    gap: 2,
  },
  statValue: { color: colors.textPrimary, ...typography.h1 },
  statLabel: { color: colors.textMuted, ...typography.caption, textAlign: "center" },
  footer: { padding: layout.screenPadding, borderTopWidth: 1, borderTopColor: colors.border },
});
