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
  | "ProgressTab"
  | "Subscription"
  | "Purchases"
  | "TimelineOverview"
  | "Reminders"
  | "SettingsHub"
  | "Referral"
  | "ProfessionalRelationship";

/**
 * More Menu — docs/mobile/03-screen-inventory.md §L/N/O. 31 Aug 2026 design
 * polish: a profile card + iconized ListRows. See git history for the
 * feature-level notes on which rows are real vs. the one inert "Programs"
 * placeholder.
 *
 * **FynroX R1 (28 Sep 2026):** "Progress" is back in this list and
 * "Recover" is out, reversing the 14 Sep swap — the handoff's §2 decision
 * #1 puts Recover in the tab bar and Progress in More, and explicitly
 * changes the BR-USR-001/002 rules that drove the 14 Sep version. See
 * MainTabs.tsx's own comment for the full history.
 */
const ROWS: Array<{ label: string; subtitle: string; icon: IconName; tint: string; tintSoft: string; target: MoreTarget }> = [
  { label: "Progress", subtitle: "Measurements, photos & check-ins", icon: "trending-up", tint: colors.accent, tintSoft: colors.accentSoft, target: "ProgressTab" },
  { label: "Timeline", subtitle: "Milestones & PRs", icon: "calendar", tint: colors.accent, tintSoft: colors.accentSoft, target: "TimelineOverview" },
  { label: "Coaching", subtitle: "Request, status & your team", icon: "message", tint: colors.aiAccent, tintSoft: colors.aiAccentSoft, target: "ProfessionalRelationship" },
  { label: "Subscription", subtitle: "Plan & payments", icon: "trophy", tint: colors.warning, tintSoft: colors.warningSoft, target: "Subscription" },
  // U-M22 — receipts and refund status, previously invisible to the user.
  { label: "Purchases", subtitle: "Receipts & refund status", icon: "calendar", tint: colors.cyan, tintSoft: "rgba(34,211,238,0.16)", target: "Purchases" },
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
