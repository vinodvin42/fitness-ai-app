import React from "react";
import { Pressable, Share, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationProp } from "@react-navigation/native";
import type { SubscriptionDetail } from "@fitness-ai-app/types";
import { Avatar } from "../../components/Avatar";
import { Icon, IconName } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import { fetchCurrentSubscription } from "../../api/subscriptions";
import { fetchReferralSummary } from "../../api/referrals";
import { fetchMyPrograms } from "../../api/programPurchases";
import { fetchDevices } from "../../api/devices";
import { fetchOnboardingProfile } from "../../api/users";
import { fetchPartner, PARTNER_KEY } from "../../api/partner";
import { useSavedRecipes } from "../../api/savedRecipes";
import { BRAND_NAME } from "../../lib/brand";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import { RecoverShell } from "../recover/parts";
import { GroupHeader, RowGroup, SettingRow, TextAction } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "Profile">;

/** A short, stable member id derived from the real user id (no separate id column exists). */
export function memberIdFor(userId: string | undefined): string | null {
  if (!userId) return null;
  const hex = userId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
  return hex ? `PF-${hex}` : null;
}

/** Fraction of the current billing period already used (0..1), or null when it cannot be known. */
export function periodProgress(sub: Pick<SubscriptionDetail, "createdAt" | "renewsAt">, now = Date.now()): number | null {
  if (!sub.renewsAt) return null;
  const start = new Date(sub.createdAt).getTime();
  const end = new Date(sub.renewsAt).getTime();
  if (!(end > start)) return null;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Profile (Figma Profile & Settings 01): identity block with a derived Member
 * ID, Share Profile / View Profile, Current Plan card (real subscription and
 * period progress), Invite Friends card and the Quick Links list. Counts and
 * values on the rows all come from real queries; nothing is hard-coded.
 * "Share Profile" shares a plain-text invite (referral code): there is no
 * public profile page.
 */
export function ProfileScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { colors: theme } = useTheme();
  const tabs = () => navigation.getParent<NavigationProp<MainTabsParamList>>();

  const subscription = useQuery({ queryKey: ["subscriptions", "current"], queryFn: fetchCurrentSubscription });
  const referral = useQuery({ queryKey: ["referrals", "me"], queryFn: fetchReferralSummary });
  const onboarding = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile });
  const programs = useQuery({ queryKey: ["myPrograms"], queryFn: fetchMyPrograms });
  const devices = useQuery({ queryKey: ["devices"], queryFn: fetchDevices });
  const partner = useQuery({ queryKey: PARTNER_KEY, queryFn: fetchPartner });
  const saved = useSavedRecipes();

  const sub = subscription.data;
  const progress = sub ? periodProgress(sub) : null;
  const memberId = memberIdFor(user?.id);
  const goalCount = onboarding.data?.goals?.length;
  const deviceCount = (devices.data ?? []).filter((d) => d.status !== "disconnected").length;

  const share = () => {
    const code = referral.data?.code ?? user?.referralCode;
    const message = code
      ? `Join me on ${BRAND_NAME}! Use my invite code ${code} when you sign up.`
      : `Join me on ${BRAND_NAME}!`;
    void Share.share({ message }).catch(() => undefined);
  };

  const links: Array<{ title: string; icon: IconName; value?: string; onPress: () => void; pill?: string }> = [
    { title: "Account Settings", icon: "profile", onPress: () => navigation.navigate("SettingsHub") },
    {
      title: "My Goals",
      icon: "target",
      value: goalCount != null ? `${goalCount} goal${goalCount === 1 ? "" : "s"}` : undefined,
      onPress: () => navigation.navigate("MyGoals"),
    },
    {
      title: "My Programs",
      icon: "dumbbell",
      value: programs.data ? `${programs.data.length} program${programs.data.length === 1 ? "" : "s"}` : undefined,
      onPress: () => tabs()?.navigate("Train", { screen: "MyPrograms" }),
    },
    {
      title: "Saved Recipes",
      icon: "heart",
      value: saved.data ? `${saved.data.length} saved` : undefined,
      onPress: () => navigation.navigate("SavedRecipes"),
    },
    {
      title: "Connected devices",
      icon: "watch",
      value: devices.data ? `${deviceCount} connected` : undefined,
      onPress: () => navigation.navigate("AppleHealthDevices"),
    },
    { title: "Subscription", icon: "zap", pill: sub?.plan.name, onPress: () => navigation.navigate("MyPlan") },
    { title: "Data & Privacy", icon: "shield-check", onPress: () => navigation.navigate("PrivacySettings") },
    { title: "Security", icon: "lock", onPress: () => navigation.navigate("Security") },
    {
      title: "My Gym",
      icon: "home",
      value: partner.data?.gym.name,
      onPress: () => navigation.navigate(partner.data ? "MyGym" : "PartnerCode"),
    },
    { title: "Purchase history", icon: "file-text", onPress: () => navigation.navigate("SubscriptionHistory") },
    { title: "Help & Support", icon: "life-buoy", onPress: () => navigation.navigate("Support") },
  ];

  return (
    <RecoverShell centered title="Profile" onBack={() => navigation.goBack()}>
      <View style={{ alignItems: "center", gap: 6, paddingVertical: spacing.sm }}>
        <View>
          <Avatar name={user?.fullName} size={92} />
          <Pressable
            onPress={() => navigation.navigate("EditProfile")}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: theme.accent,
              borderWidth: 2,
              borderColor: colors.background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="pencil" size={13} color={theme.textOnAccent} />
          </Pressable>
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22, marginTop: 4 }}>{user?.fullName}</Text>
        {memberId ? <Text style={{ color: colors.textMuted, ...typography.meta }}>Member ID: {memberId}</Text> : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share profile" hitSlop={8}>
            <Text style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 12 }}>Share Profile</Text>
          </Pressable>
          <Text style={{ color: colors.textMuted }}>·</Text>
          <Pressable onPress={() => navigation.navigate("EditProfile")} accessibilityRole="button" accessibilityLabel="View profile" hitSlop={8}>
            <Text style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 12 }}>View Profile</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => navigation.navigate("MyPlan")}
        accessibilityRole="button"
        accessibilityLabel={sub ? `Current plan ${sub.plan.name}` : "Choose a plan"}
        style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>Current Plan</Text>
          <Text style={{ color: theme.accent, fontFamily: fonts.displayBold, fontSize: 14 }}>
            {subscription.isLoading ? "…" : sub ? sub.plan.name : "None"}
          </Text>
        </View>
        {sub ? (
          <>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
              {sub.renewsAt ? `${sub.cancelAtPeriodEnd ? "Ends" : "Renews"} on ${fmtDate(sub.renewsAt)}` : "No renewal date"}
            </Text>
            {progress != null ? (
              <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
                <View style={{ width: `${Math.round(progress * 100)}%`, height: 5, backgroundColor: theme.accent }} />
              </View>
            ) : null}
          </>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            {subscription.isError ? "Couldn't load your plan." : "No active plan. Tap to see plans."}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate("Referral")}
        accessibilityRole="button"
        accessibilityLabel="Invite friends"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 14,
        }}
      >
        <View style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.warningSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name="sparkles" size={18} color={colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>Invite Friends</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
            {referral.data
              ? `Your code ${referral.data.code} · ${referral.data.referredSignups} signup${referral.data.referredSignups === 1 ? "" : "s"}`
              : "Share your invite code"}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={colors.textMuted} />
      </Pressable>

      <GroupHeader>Quick Links</GroupHeader>
      <RowGroup>
        {links.map((l) => (
          <SettingRow
            key={l.title}
            icon={l.icon}
            title={l.title}
            value={l.value}
            onPress={l.onPress}
            right={
              l.pill ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 12 }}>{l.pill}</Text>
                  <Icon name="chevron-right" size={16} color={colors.textMuted} />
                </View>
              ) : undefined
            }
          />
        ))}
      </RowGroup>

      <TextAction label="Log Out" danger onPress={logout} />
    </RecoverShell>
  );
}
