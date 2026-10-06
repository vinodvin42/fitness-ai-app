import React, { useMemo } from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ConsentType } from "@fitness-ai-app/types";
import { StateLayout, InfoCard } from "../../components/StatePanels";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "ConsentWithdrawn">;

interface Copy {
  title: string;
  description: string;
  changesTitle: string;
  changes: string[];
}

const COPY: Record<ConsentType, Copy> = {
  health_data_processing: {
    title: "Health consent withdrawn",
    description: "You confirmed your choice to withdraw consent. Health-data processing and health-based personalization are now stopped.",
    changesTitle: "What changes",
    changes: [
      "Your conditions, injuries and connected health data are no longer used to adjust workouts or wellness guidance.",
      "Health-based insights stop. You can still use general, non-personalized features.",
    ],
  },
  data_analytics: {
    title: "Analytics consent withdrawn",
    description: "You confirmed your choice to withdraw consent. Product analytics from your activity are now stopped.",
    changesTitle: "What changes",
    changes: ["We stop using your in-app activity to improve the product.", "The app works the same. Analytics already collected isn't erased by this."],
  },
  marketing_emails: {
    title: "Marketing consent withdrawn",
    description: "You confirmed your choice to withdraw consent. Promotional emails are now stopped.",
    changesTitle: "What changes",
    changes: ["We stop sending promotional emails.", "Account and security emails still go out."],
  },
};

function formatEffective(d: Date): string {
  const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", "");
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${date} · ${time}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Text style={{ width: 84, color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 }}>{label}</Text>
      <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{value}</Text>
    </View>
  );
}

/**
 * Figma "01 Onboarding / 10 Health consent withdrawn" — shown after a consent is
 * turned off in Privacy settings. The effective time is when this screen opened
 * (the toggle just succeeded). "Manage account deletion" opens Security with the
 * Delete Account section first; re-granting consent is done from Privacy & Data.
 */
export function ConsentWithdrawnScreen({ navigation, route }: Props) {
  const { type } = route.params;
  const copy = COPY[type];
  const { user } = useAuth();
  const { colors: theme } = useTheme();
  const effective = useMemo(() => formatEffective(new Date()), []);

  return (
    <StateLayout
      showBrand
      flowLabel="Consent / Privacy & data"
      flowIcon="shield-off"
      title={copy.title}
      description={copy.description}
      onBack={() => navigation.goBack()}
      actions={[
        { label: "Back to Privacy & Data", onPress: () => navigation.goBack() },
        { label: "Manage account deletion", variant: "secondary", onPress: () => navigation.navigate("Security", { focus: "delete" }) },
      ]}
    >
      <View
        style={{
          backgroundColor: colors.infoSurface,
          borderColor: colors.infoBorder,
          borderWidth: 1,
          borderRadius: radius.md,
          padding: spacing.md,
          gap: 10,
        }}
      >
        <Text style={{ color: theme.accent, ...typography.h3, fontSize: 14 }}>Withdrawal confirmed</Text>
        <DetailRow label="Account" value={user?.fullName ?? ""} />
        <DetailRow label="Effective" value={effective} />
      </View>
      <InfoCard title={copy.changesTitle} body={copy.changes} />
      <InfoCard
        title="This is not account deletion"
        body={[
          "Your account remains open. Withdrawal is not a promise that every historical record is erased. Review data retention and deletion options in Privacy & Data.",
          "Full account deletion is a separate request with its own confirmation.",
        ]}
      />
      <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 11, lineHeight: 16 }}>
        You can review a new consent choice later. Personalization won't resume unless you give consent again.
      </Text>
    </StateLayout>
  );
}
