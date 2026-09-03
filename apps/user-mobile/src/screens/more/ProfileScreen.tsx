import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SubscriptionDetail } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { useAuth } from "../../context/AuthContext";
import { fetchCurrentSubscription } from "../../api/subscriptions";
import { fetchReferralSummary } from "../../api/referrals";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Profile">;

const TIER_LABEL: Record<SubscriptionDetail["plan"]["tier"], string> = { basic: "Basic", pro: "Pro", elite: "Elite" };
const STATUS_TONE: Record<SubscriptionDetail["status"], "success" | "accent" | "warning" | "neutral"> = {
  active: "success",
  trialing: "accent",
  past_due: "warning",
  canceled: "neutral",
};

/**
 * Profile (docs/mobile/03-screen-inventory.md §N) — Phase 1 shipped the
 * identity card (name/email/phone/member since) + links into Edit Profile
 * and Preferences. 19 Aug 2026: added the two other named-but-unbuilt
 * pieces this screen's own doc comment used to flag as blocked — a real
 * **subscription status card** and a real **Invite Friends card** — both
 * of which are genuinely unblocked now, since Subscription (§M, Phase 3)
 * and Referral (§O, Phase 4) both already exist as real features. Each
 * card reads the exact same query key its own dedicated screen already
 * uses (`["subscriptions", "current"]`, `["referrals", "me"]`), so the
 * cache is shared and there's no duplicate fetch. Each has its own
 * loading/error handling so a failed fetch on one card doesn't block the
 * rest of the screen (same per-section pattern EditProfileScreen's "About
 * You" section already established).
 *
 * Still NOT built: avatar upload (no image-storage backend exists to
 * receive an uploaded photo), and the rest of the design's quick-links
 * menu — My Goals (no goal-setting feature exists, see gap §10), Saved
 * Recipes (no "save a recipe" feature/table exists), Connected Devices
 * (needs the same Bluetooth/HealthKit integration Recovery & Devices is
 * blocked on, gap §13), and legal links (no Terms/Privacy documents exist
 * in this build to link to). None of these are guesses this pass could
 * resolve — each needs a feature or a document that doesn't exist yet.
 */
export function ProfileScreen({ navigation }: Props) {
  const { user } = useAuth();

  const {
    data: subscription,
    isLoading: isSubscriptionLoading,
    isError: isSubscriptionError,
    refetch: refetchSubscription,
  } = useQuery({ queryKey: ["subscriptions", "current"], queryFn: fetchCurrentSubscription });

  const {
    data: referral,
    isLoading: isReferralLoading,
    isError: isReferralError,
    refetch: refetchReferral,
  } = useQuery({ queryKey: ["referrals", "me"], queryFn: fetchReferralSummary });

  return (
    <ScreenContainer title="Profile">
      <Card style={{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg }}>
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: radius.pill,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.xs,
          }}
        >
          <Text style={{ color: colors.accent, ...typography.metricLarge }}>
            {(user?.fullName ?? "?").slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.h1 }}>{user?.fullName}</Text>
        <Text style={{ color: colors.textSecondary }}>{user?.email}</Text>
        {user?.phone ? <Text style={{ color: colors.textMuted, ...typography.meta }}>{user.phone}</Text> : null}
        {user?.createdAt ? (
          <Text style={{ color: colors.textMuted, ...typography.caption, marginTop: spacing.xs }}>
            Member since {new Date(user.createdAt).toLocaleDateString()}
          </Text>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Subscription</Text>
        {isSubscriptionError ? (
          <ErrorState message="Couldn't load your subscription." onRetry={() => refetchSubscription()} />
        ) : isSubscriptionLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : subscription ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.textPrimary, ...typography.body, fontFamily: fonts.bodySemi }}>
                {TIER_LABEL[subscription.plan.tier]} — {subscription.plan.name}
              </Text>
              <Pill label={subscription.status} tone={STATUS_TONE[subscription.status]} />
            </View>
            {subscription.renewsAt ? (
              <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
                Renews {new Date(subscription.renewsAt).toLocaleDateString()}
              </Text>
            ) : null}
            <Button
              label="Manage Subscription"
              variant="secondary"
              onPress={() => navigation.navigate("Subscription")}
              style={{ marginTop: spacing.md }}
            />
          </>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary }}>No active subscription.</Text>
            <Button
              label="View Plans"
              variant="secondary"
              onPress={() => navigation.navigate("Subscription")}
              style={{ marginTop: spacing.md }}
            />
          </>
        )}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Invite Friends</Text>
        {isReferralError ? (
          <ErrorState message="Couldn't load your referral code." onRetry={() => refetchReferral()} />
        ) : isReferralLoading || !referral ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <Text style={{ color: colors.textSecondary }}>
              Your code <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi }}>{referral.code}</Text> has
              {" "}
              {referral.referredSignups} signup{referral.referredSignups === 1 ? "" : "s"} so far.
            </Text>
            <Button
              label="Invite Friends"
              variant="secondary"
              onPress={() => navigation.navigate("Referral")}
              style={{ marginTop: spacing.md }}
            />
          </>
        )}
      </Card>

      <View style={{ gap: spacing.sm }}>
        <ListRow icon="profile" title="Edit Profile" tint={colors.accent} tintSoft={colors.accentSoft} onPress={() => navigation.navigate("EditProfile")} />
        <ListRow icon="settings" title="Preferences" tint={colors.textSecondary} tintSoft={colors.surfaceHigh} onPress={() => navigation.navigate("Preferences")} />
      </View>
    </ScreenContainer>
  );
}
