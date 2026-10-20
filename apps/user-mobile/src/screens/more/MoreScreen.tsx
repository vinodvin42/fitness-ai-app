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
import { fetchPlans } from "../../api/subscriptions";
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
 * More Menu - Figma Today 05. Top block (banner + the design's seven rows) is
 * the frame; the app's other real destinations (Medicine, Reminders list,
 * Referral, Subscription, Settings, Support) are kept in a second group below
 * it rather than removed. The banner names the app's REAL subscription plans
 * (GET /subscriptions/plans), not hardcoded tier names.
 */
export function MoreScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const plans = useQuery({ queryKey: ["subscriptions", "plans"], queryFn: fetchPlans, staleTime: 5 * 60_000 });
  const tabs = () => navigation.getParent<NavigationProp<MainTabsParamList>>();
  // Learn (05.04, Oct 2026) appears only once at least one article is published.
  const learn = useQuery({ queryKey: ["learn", "articles", "all"], queryFn: () => fetchLearnArticles(), staleTime: 5 * 60_000 });
  const hasLearn = (learn.data?.articles.length ?? 0) > 0;

  // The plans on sale in the admin portal, cheapest first: "Compare Basic & Prime".
  const planNames = Array.from(
    new Set(
      (plans.data ?? [])
        .sort((a, b) => a.priceCents - b.priceCents)
        .map((p) => p.name),
    ),
  );
  const primeName = (plans.data ?? []).find((p) => p.tier === "prime")?.name;
  const bannerNote = primeName
    ? `${primeName} adds coach requests and priority support.`
    : "See what each plan includes.";
  const bannerTitle =
    planNames.length === 2 ? `Compare ${planNames[0]} & ${planNames[1]}` : planNames.length > 2 ? "Compare plans" : "Explore plans";

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
  ];

  const secondary: MoreRow[] = [
    { label: t("more.rows.reminders.label"), icon: "clock", tint: colors.cyan, onPress: () => navigation.navigate("Reminders") },
    { label: "Medicine", icon: "pill", tint: colors.pink, onPress: () => navigation.navigate("MedicationList") },
    { label: t("more.rows.subscription.label"), icon: "zap", tint: colors.warning, onPress: () => navigation.navigate("Subscription") },
    // Origin (Fynrox R1, U-M22): receipts and refund status.
    { label: t("more.rows.purchases.label"), icon: "calendar", tint: colors.cyan, onPress: () => navigation.navigate("Purchases") },
    { label: t("more.rows.referral.label"), icon: "sparkles", tint: colors.pink, onPress: () => navigation.navigate("Referral") },
    { label: t("more.rows.settings.label"), icon: "settings", tint: colors.textSecondary, onPress: () => navigation.navigate("SettingsHub") },
    ...(hasLearn ? [{ label: "Learn", icon: "file-text" as const, tint: colors.success, onPress: () => navigation.navigate("Learn") }] : []),
    { label: "Support", icon: "info", tint: colors.cyan, onPress: () => navigation.navigate("Support") },
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
        onPress={() => navigation.navigate("Subscription")}
        accessibilityRole="button"
        accessibilityLabel={`${bannerTitle}. ${bannerNote}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          padding: 14,
          borderRadius: radius.card,
          backgroundColor: colors.aiSurface,
          borderWidth: 1,
          borderColor: colors.aiBorder,
        }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.aiAccent, alignItems: "center", justifyContent: "center" }}>
          <Icon name="sparkles" size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{bannerTitle}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{bannerNote}</Text>
        </View>
        <Icon name="chevron-right" size={18} color={colors.textPrimary} />
      </Pressable>

      <RowGroup rows={primary} />
      <RowGroup rows={secondary} />

      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.xs }}>
        {BRAND_NAME} Version {Constants.expoConfig?.version ?? "—"}
      </Text>
      <Pressable onPress={logout} accessibilityRole="button" accessibilityLabel="Log out of account" style={{ alignSelf: "center", padding: spacing.sm }}>
        <Text style={{ color: colors.dangerText, fontFamily: fonts.bodySemi, fontSize: 15 }}>{t("more.logOut")}</Text>
      </Pressable>
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
