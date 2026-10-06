import React from "react";
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
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  return (
    <ScreenContainer title="More">
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <MenuRow
          label="Availability & Capacity"
          subtitle="Your lifecycle status and how many clients you can take on"
          onPress={() => navigation.navigate("AvailabilityCapacity")}
        />
        <MenuRow
          label="Form reviews"
          subtitle="Review exercise clips submitted by your clients"
          onPress={() => navigation.navigate("FormReviews")}
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
