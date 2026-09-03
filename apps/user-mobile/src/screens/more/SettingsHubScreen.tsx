import React from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Icon, IconName } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "SettingsHub">;

/**
 * Settings hub (docs/mobile/03-screen-inventory.md §L, Phase 4). 31 Aug 2026
 * design polish: iconized ListRows. Destinations unchanged. Health Connect
 * stays an honest "blocked" note (needs Bluetooth/HealthKit — gap §13).
 */
const ROWS: Array<{
  label: string;
  subtitle: string;
  icon: IconName;
  tint: string;
  tintSoft: string;
  target: "LanguageSelection" | "NotificationSettings" | "Security" | "Support";
}> = [
  { label: "Language", subtitle: "App language", icon: "globe", tint: colors.accent, tintSoft: colors.accentSoft, target: "LanguageSelection" },
  { label: "Notifications", subtitle: "Reminder scheduling", icon: "bell", tint: colors.cyan, tintSoft: "rgba(34,211,238,0.16)", target: "NotificationSettings" },
  { label: "Security & Privacy", subtitle: "Password, sessions, data", icon: "shield-check", tint: colors.success, tintSoft: colors.successSoft, target: "Security" },
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

      <Card style={{ borderStyle: "dashed", flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Icon name="heart-pulse" size={20} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary, ...typography.h3 }}>Health Connect</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
            Wearable sync needs a native Bluetooth/HealthKit integration this build can't do yet.
          </Text>
        </View>
      </Card>
    </ScreenContainer>
  );
}
