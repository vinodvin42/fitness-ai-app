import React from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { useAuth } from "../../context/AuthContext";
import { fetchFormReviews } from "../../api/formReviews";
import { confirmAction, showAlert } from "../../lib/dialogs";
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
 *
 * 26 Oct 2026 (coach app audit): an Account section with Verification &
 * documents (the onboarding screens, reachable again after onboarding),
 * Help & support, and Sign out with a confirmation (it used to be only an
 * unconfirmed text link at the bottom of Today). Form reviews shows how many
 * clips are waiting.
 */
export function MoreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { logout } = useAuth();
  // Same query key as the Form reviews list, so this is one cached request.
  const formReviews = useQuery({ queryKey: ["coach-form-reviews"], queryFn: fetchFormReviews });
  const toReview = (formReviews.data ?? []).filter((r) => r.status === "queued").length;

  const signOut = () =>
    confirmAction(t("more.signOut.confirmTitle"), t("more.signOut.confirmMessage"), t("more.signOut.confirm"), () => {
      void logout();
    });

  const help = () => {
    void Linking.openURL("mailto:support@fynrox.com").catch(() => undefined);
    showAlert(t("more.help.title"), t("more.help.message"));
  };

  return (
    <ScreenContainer title={t("more.title")}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <MenuRow
          label={t("more.availability.label")}
          subtitle={t("more.availability.subtitle")}
          onPress={() => navigation.navigate("AvailabilityCapacity")}
        />
        {/* Coach gender (20 Oct 2026): for members who ask for a male or female coach. */}
        <MenuRow
          label={t("more.profile.label")}
          subtitle={t("more.profile.subtitle")}
          onPress={() => navigation.navigate("MyProfile")}
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
        <MenuRow
          label={t("more.formReviews.label")}
          subtitle={t("more.formReviews.subtitle")}
          badge={toReview > 0 ? t("more.needsReview", { count: toReview }) : undefined}
          onPress={() => navigation.navigate("FormReviews")}
        />
      </Card>

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: spacing.sm }}>
        {t("more.account").toUpperCase()}
      </Text>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <MenuRow
          label={t("more.verification.label")}
          subtitle={t("more.verification.subtitle")}
          onPress={() => navigation.navigate("VerificationStatus")}
        />
        <MenuRow label={t("more.help.label")} subtitle={t("more.help.subtitle")} onPress={help} />
        <MenuRow label={t("more.signOut.label")} subtitle={t("more.signOut.subtitle")} onPress={signOut} danger />
      </Card>
    </ScreenContainer>
  );
}

function MenuRow({
  label,
  subtitle,
  onPress,
  badge,
  danger = false,
}: {
  label: string;
  subtitle: string;
  onPress: () => void;
  badge?: string;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        backgroundColor: pressed ? colors.surfaceRaised : "transparent",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.sm,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? colors.danger : colors.textPrimary, fontWeight: "600", fontSize: 15 }}>{label}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={{ backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: colors.background, fontSize: 12, fontWeight: "700" }}>{badge}</Text>
        </View>
      ) : null}
      <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}
