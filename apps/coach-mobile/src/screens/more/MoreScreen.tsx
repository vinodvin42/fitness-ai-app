import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { colors, spacing } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

/**
 * More tab (R2 Wave 2, 20 Sep 2026) — previously a bare `ComingSoonScreen`
 * with zero real content (MainTabs.tsx's own doc comment: "More still has
 * zero frames to build against, on either app or role"). That's still true
 * for a designed More menu — no Figma frame exists for this tab — but this
 * wave gives it one real, honest destination: Availability & Capacity (see
 * AvailabilityScreen.tsx's own doc comment). Built as a simple menu list
 * rather than embedding that screen directly in the tab, so future real
 * More items (earnings settings, notification prefs, etc., none built yet)
 * have an obvious place to land without another MainTabs.tsx rewrite.
 */
export function MoreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  return (
    <ScreenContainer title={t("more.title")}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <MenuRow
          label={t("more.availability.label")}
          subtitle={t("more.availability.subtitle")}
          onPress={() => navigation.navigate("AvailabilityCapacity")}
        />
        {/* P6 (28 Sep 2026) — the earnings surface. The handoff lists
            earnings, payout pending/paid/failed and earnings history
            among this app's complete-as-designed screens; none of them
            existed, which meant a professional had no way to see what
            they had been paid. */}
        <MenuRow
          label={t("more.earnings.label")}
          subtitle={t("more.earnings.subtitle")}
          onPress={() => navigation.navigate("Earnings")}
        />
        {/* P-M7 — the offers list. Today only ever showed live offers, so
            a declined or expired one simply vanished. */}
        <MenuRow
          label={t("more.offers.label")}
          subtitle={t("more.offers.subtitle")}
          onPress={() => navigation.navigate("Offers")}
        />
      </Card>
    </ScreenContainer>
  );
}

function MenuRow({ label, subtitle, onPress }: { label: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        backgroundColor: pressed ? colors.surfaceRaised : "transparent",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 15 }}>{label}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}
