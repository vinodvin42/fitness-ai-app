import React from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Icon, IconName } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { useAuth } from "../../context/AuthContext";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MoreHub">;

type MoreTarget =
  | "Profile"
  | "Progress"
  | "Subscription"
  | "TimelineOverview"
  | "Reminders"
  | "SettingsHub"
  | "Referral"
  | "CoachDiscovery";

/**
 * More Menu — docs/mobile/03-screen-inventory.md §L/N/O. 31 Aug 2026 design
 * polish: a profile card + iconized ListRows. Destinations/navigation
 * unchanged. See git history for the feature-level notes on which rows are
 * real vs. the one inert "Programs" placeholder.
 */
const ROWS: Array<{ label: string; subtitle: string; icon: IconName; tint: string; tintSoft: string; target: MoreTarget }> = [
  { label: "Progress & Body", subtitle: "Measurements, streaks, photos", icon: "trending-up", tint: colors.success, tintSoft: colors.successSoft, target: "Progress" },
  { label: "Timeline", subtitle: "Milestones & PRs", icon: "calendar", tint: colors.accent, tintSoft: colors.accentSoft, target: "TimelineOverview" },
  { label: "Coaching", subtitle: "Find & message a coach", icon: "message", tint: colors.aiAccent, tintSoft: colors.aiAccentSoft, target: "CoachDiscovery" },
  { label: "Subscription", subtitle: "Plan & payments", icon: "trophy", tint: colors.warning, tintSoft: colors.warningSoft, target: "Subscription" },
  { label: "Reminders", subtitle: "Workout, meal & water nudges", icon: "bell", tint: colors.cyan, tintSoft: "rgba(34,211,238,0.16)", target: "Reminders" },
  { label: "Refer & Invite", subtitle: "Earn free months", icon: "sparkles", tint: colors.pink, tintSoft: "rgba(236,72,153,0.16)", target: "Referral" },
  { label: "Settings", subtitle: "Account, security, language", icon: "settings", tint: colors.textSecondary, tintSoft: colors.surfaceHigh, target: "SettingsHub" },
];

export function MoreScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const initials = (user?.fullName ?? "?").slice(0, 1).toUpperCase();

  return (
    <ScreenContainer title="More">
      <Pressable onPress={() => navigation.navigate("Profile")}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: radius.pill,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.accent, ...typography.h1 }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{user?.fullName}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{user?.email}</Text>
          </View>
          <Icon name="chevron-right" size={20} color={colors.textMuted} />
        </Card>
      </Pressable>

      <View style={{ gap: spacing.sm }}>
        {ROWS.map((r) => (
          <ListRow
            key={r.label}
            icon={r.icon}
            title={r.label}
            subtitle={r.subtitle}
            tint={r.tint}
            tintSoft={r.tintSoft}
            onPress={() => navigation.navigate(r.target)}
          />
        ))}
      </View>

      <Pressable onPress={logout}>
        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }}>
          <Text style={{ color: colors.danger, ...typography.label }}>Log out</Text>
        </Card>
      </Pressable>
    </ScreenContainer>
  );
}
