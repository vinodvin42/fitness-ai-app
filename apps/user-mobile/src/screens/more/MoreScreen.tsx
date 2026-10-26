import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { MyAvatar } from "../../components/MyAvatar";
import { Icon, IconName } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import { fetchReferralSummary } from "../../api/referrals";
import { Card } from "../../components/Card";
import { fetchLearnArticles } from "../../api/learn";
import { BRAND_NAME } from "../../lib/brand";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MoreHub">;

interface MoreRow {
  label: string;
  icon: IconName;
  tint: string;
  badge?: string;
  onPress: () => void;
}

/**
 * More Menu - Figma Today 05: the banner card and the design's seven rows.
 *
 * 25 Oct 2026 (owner): the first card is Refer & Invite (it was "Compare
 * Basic & Prime"; plans stay one tap away under Profile > Subscription). Its line is
 * the real referral rule (referrals.service.ts): 1 month of credit when a
 * friend you invite starts a paid plan, or the credit already waiting.
 *
 * 26 Oct 2026 (owner): More keeps Refer & Invite, My Schedule, Progress, Coach, Body Composition, Your
 * Lifetime, Add Reminder and Paid Programs. Subscription, Purchases, Settings, Support and Log out were
 * duplicates of Profile (the avatar, top right) and are only there now. Learn stays while articles exist,
 * because nothing else opens it.
 */
export function MoreScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const referral = useQuery({ queryKey: ["referrals", "me"], queryFn: fetchReferralSummary, staleTime: 60_000 });
  const tabs = () => navigation.getParent<NavigationProp<MainTabsParamList>>();
  // Learn (05.04, Oct 2026) appears only once at least one article is published.
  const learn = useQuery({ queryKey: ["learn", "articles", "all"], queryFn: () => fetchLearnArticles(), staleTime: 5 * 60_000 });
  const hasLearn = (learn.data?.articles.length ?? 0) > 0;

  const creditMonths = referral.data?.creditMonths ?? 0;
  const referralNote =
    creditMonths > 0
      ? `${creditMonths} month${creditMonths === 1 ? "" : "s"} of credit waiting. Invite more friends.`
      : "Get 1 month of credit when a friend you invite starts a paid plan.";

  const primary: MoreRow[] = [
    { label: "My Schedule", icon: "calendar", tint: colors.accent, badge: "Today", onPress: () => tabs()?.navigate("Today", { screen: "Schedule", initial: false }) },
    { label: t("more.rows.progress.label"), icon: "trending-up", tint: colors.success, onPress: () => navigation.navigate("ProgressSection") },
    {
      label: "Body Composition",
      icon: "scale",
      tint: colors.aiAccent,
      onPress: () => navigation.navigate("ProgressSection", { screen: "BodyComposition" }),
    },
    { label: "Your Lifetime", icon: "trophy", tint: colors.accent, badge: "New", onPress: () => navigation.navigate("TimelineOverview") },
    { label: "Coach", icon: "message", tint: colors.success, onPress: () => navigation.navigate("ProfessionalRelationship") },
    { label: "Add Reminder", icon: "bell", tint: colors.aiAccent, onPress: () => navigation.navigate("ReminderForm", {}) },
    { label: "Paid Programs", icon: "dumbbell", tint: colors.accent, onPress: () => tabs()?.navigate("Train", { screen: "ProgramsMarketplace", initial: false }) },
    ...(hasLearn ? [{ label: "Learn", icon: "file-text" as const, tint: colors.success, onPress: () => navigation.navigate("Learn") }] : []),
  ];

  return (
    <ScreenContainer
      title={t("more.title")}
      subtitle={`${BRAND_NAME} App Settings & Features`}
      right={
        <Pressable onPress={() => navigation.navigate("Profile")} accessibilityRole="button" accessibilityLabel="Open profile">
          <MyAvatar name={user?.fullName} size={44} />
        </Pressable>
      }
    >
      <Pressable
        onPress={() => navigation.navigate("Referral")}
        accessibilityRole="button"
        accessibilityLabel={`${t("more.rows.referral.label")}. ${referralNote}`}
      >
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.warningSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="gift" size={22} color={colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t("more.rows.referral.label")}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{referralNote}</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textSecondary} />
        </Card>
      </Pressable>

      <RowGroup rows={primary} />

      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.xs }}>
        {BRAND_NAME} Version {Constants.expoConfig?.version ?? "—"}
      </Text>
    </ScreenContainer>
  );
}

function RowGroup({ rows }: { rows: MoreRow[] }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      {rows.map((r, i) => (
        <Pressable
          key={r.label}
          onPress={r.onPress}
          accessibilityRole="button"
          accessibilityLabel={r.badge ? `${r.label}, ${r.badge}` : r.label}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.border,
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: r.tint, alignItems: "center", justifyContent: "center" }}>
            <Icon name={r.icon} size={20} color="#FFFFFF" />
          </View>
          <Text style={{ flex: 1, color: colors.textPrimary, ...typography.h3, fontFamily: fonts.bodySemi }}>{r.label}</Text>
          {r.badge ? (
            <View style={{ backgroundColor: colors.aiAccentSoft, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: colors.aiText, fontSize: 13 }}>{r.badge}</Text>
            </View>
          ) : null}
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}
