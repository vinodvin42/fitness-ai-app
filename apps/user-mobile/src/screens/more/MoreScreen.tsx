import React from "react";
import { Pressable, Text, View } from "react-native";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Avatar } from "../../components/Avatar";
import { Icon, IconName } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import { fetchPlans } from "../../api/subscriptions";
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
  const { user, logout } = useAuth();
  const plans = useQuery({ queryKey: ["subscriptions", "plans"], queryFn: fetchPlans, staleTime: 5 * 60_000 });
  const tabs = () => navigation.getParent<NavigationProp<MainTabsParamList>>();

  // Paid tiers only (the free tier isn't something to "compare to"), cheapest first.
  const planNames = Array.from(
    new Set(
      (plans.data ?? [])
        .filter((p) => p.priceCents > 0)
        .sort((a, b) => a.priceCents - b.priceCents)
        .map((p) => p.name),
    ),
  );
  const bannerTitle =
    planNames.length === 2 ? `Compare ${planNames[0]} & ${planNames[1]}` : planNames.length > 2 ? "Compare plans" : "Explore plans";

  const primary: MoreRow[] = [
    { label: "My Schedule", icon: "calendar", tint: colors.accent, badge: "Today", onPress: () => tabs()?.navigate("Today", { screen: "Schedule" }) },
    { label: "Progress", icon: "trending-up", tint: colors.success, onPress: () => navigation.navigate("ProgressSection") },
    {
      label: "Body Composition",
      icon: "scale",
      tint: colors.aiAccent,
      onPress: () => navigation.navigate("ProgressSection", { screen: "BodyComposition" }),
    },
    { label: "Your Lifetime", icon: "trophy", tint: colors.accent, badge: "New", onPress: () => navigation.navigate("TimelineOverview") },
    { label: "Professional Guidance", icon: "message", tint: colors.success, onPress: () => navigation.navigate("CoachDiscovery", undefined) },
    { label: "Add Reminder", icon: "bell", tint: colors.aiAccent, onPress: () => navigation.navigate("ReminderForm", {}) },
    { label: "Paid Programs", icon: "dumbbell", tint: colors.accent, onPress: () => tabs()?.navigate("Train", { screen: "ProgramsMarketplace" }) },
  ];

  const secondary: MoreRow[] = [
    { label: "Reminders", icon: "clock", tint: colors.cyan, onPress: () => navigation.navigate("Reminders") },
    { label: "Medicine", icon: "pill", tint: colors.pink, onPress: () => navigation.navigate("MedicationList") },
    { label: "Subscription", icon: "zap", tint: colors.warning, onPress: () => navigation.navigate("Subscription") },
    { label: "Refer & Invite", icon: "sparkles", tint: colors.pink, onPress: () => navigation.navigate("Referral") },
    { label: "Settings", icon: "settings", tint: colors.textSecondary, onPress: () => navigation.navigate("SettingsHub") },
    { label: "Support", icon: "info", tint: colors.cyan, onPress: () => navigation.navigate("Support") },
  ];

  return (
    <ScreenContainer
      title="More"
      subtitle={`${BRAND_NAME} App Settings & Features`}
      right={
        <Pressable onPress={() => navigation.navigate("Profile")} accessibilityRole="button" accessibilityLabel="Open profile">
          <Avatar name={user?.fullName} size={44} />
        </Pressable>
      }
    >
      <Pressable
        onPress={() => navigation.navigate("Subscription")}
        accessibilityRole="button"
        accessibilityLabel={`${bannerTitle}. Access advanced bio-analytics and custom coaching.`}
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
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Access advanced bio-analytics & custom coaching.</Text>
        </View>
        <Icon name="chevron-right" size={18} color={colors.textPrimary} />
      </Pressable>

      <RowGroup rows={primary} />
      <RowGroup rows={secondary} />

      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.xs }}>
        {BRAND_NAME} Version {Constants.expoConfig?.version ?? "—"}
      </Text>
      <Pressable onPress={logout} accessibilityRole="button" accessibilityLabel="Log out of account" style={{ alignSelf: "center", padding: spacing.sm }}>
        <Text style={{ color: colors.danger, fontFamily: fonts.bodySemi, fontSize: 15 }}>Log Out of Account</Text>
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
              <Text style={{ color: colors.aiAccent, fontSize: 11 }}>{r.badge}</Text>
            </View>
          ) : null}
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}
