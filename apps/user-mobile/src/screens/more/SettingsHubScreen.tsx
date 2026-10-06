import React from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import type { IconName } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { colors, spacing } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "SettingsHub">;

/**
 * Settings hub (docs/mobile/03-screen-inventory.md §L, Phase 4). 31 Aug 2026
 * design polish: iconized ListRows. Health Connect stays an honest
 * real screen (consent + scopes only — see HealthConnectScreen.tsx). **18 Sep 2026:**
 * "Privacy & Consent" added — the real §4 screen over the new `Consent`
 * model (see PrivacySettingsScreen.tsx), a separate row from "Security &
 * Privacy" (which stays password/sessions/2FA/data-export/delete — the
 * GDPR-style account-security cluster, unrelated to consent toggles).
 */
const ROWS: Array<{
  label: string;
  subtitle: string;
  icon: IconName;
  tint: string;
  tintSoft: string;
  target: "LanguageSelection" | "NotificationSettings" | "Security" | "PrivacySettings" | "Support" | "HealthConnect";
}> = [
  { label: "Language", subtitle: "App language", icon: "globe", tint: colors.accent, tintSoft: colors.accentSoft, target: "LanguageSelection" },
  { label: "Notifications", subtitle: "Reminder scheduling", icon: "bell", tint: colors.cyan, tintSoft: "rgba(34,211,238,0.16)", target: "NotificationSettings" },
  { label: "Security & Privacy", subtitle: "Password, sessions, data", icon: "shield-check", tint: colors.success, tintSoft: colors.successSoft, target: "Security" },
  { label: "Privacy & Consent", subtitle: "Marketing, analytics, health data", icon: "shield-check", tint: colors.cyan, tintSoft: "rgba(34,211,238,0.16)", target: "PrivacySettings" },
  { label: "Health Connect", subtitle: "Data types you allow", icon: "heart-pulse", tint: colors.danger, tintSoft: colors.dangerSoft, target: "HealthConnect" },
  { label: "Support", subtitle: "Tickets, FAQ, contact", icon: "life-buoy", tint: colors.warning, tintSoft: colors.warningSoft, target: "Support" },
];

export function SettingsHubScreen({ navigation }: Props) {
  return (
    <ScreenContainer title="Settings">
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
    </ScreenContainer>
  );
}
