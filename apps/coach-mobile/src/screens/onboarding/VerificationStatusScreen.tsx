import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { fetchOnboardingStatus } from "../../api/professionalOnboarding";
import { colors, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

const SERVICE_LABELS: Record<ProfessionalServiceType, string> = {
  fitness: "Fitness Coaching",
  nutrition: "Nutrition Coaching",
};

/**
 * docs/coach/03-screen-inventory.md §B "Verification Status" (step 3,
 * landing) — profile summary + a per-service status card + an info message
 * explaining partial access + "Go to Dashboard". Real per-service statuses
 * (GET /professionals/me/onboarding), not mocked. "Go to Dashboard" calls
 * `markOnboardingCompleted()` — deliberately NOT called any earlier (e.g.
 * at KYC submit): RootNavigator switches straight from OnboardingStack to
 * MainTabs the instant `onboardingCompleted` flips true, so calling it
 * before this screen has actually rendered would unmount it before the
 * coach ever saw their verification status.
 *
 * 26 Oct 2026 (coach app audit): also reachable from More → Verification &
 * documents once onboarding is done. There it has a back link instead of
 * "Go to Dashboard", plus "Upload documents again" (the same credential and
 * KYC screens, registered in MoreStack under the same names). A rejected
 * credential shows the reviewer's note, and an expiry date shows when set.
 */
export function VerificationStatusScreen() {
  const { t } = useTranslation();
  const { professional, onboardingCompleted, markOnboardingCompleted } = useAuth();
  // MoreStack registers the same route names and params as OnboardingStack.
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["professional-onboarding-status"],
    queryFn: fetchOnboardingStatus,
  });
  const services = (data?.credentials ?? []).map((c) => c.serviceType);
  // A new upload sets that item back to Pending, so only offer the ones that
  // aren't verified: a coach can't lose a verified status by accident here.
  const toFix = (data?.credentials ?? []).filter((c) => c.status !== "verified").map((c) => c.serviceType);
  const kycToFix = !!data && data.kycStatus !== "verified";
  const uploadAgain = () => {
    if (toFix.length > 0) navigation.navigate("CredentialUpload", { services: toFix, index: 0 });
    else navigation.navigate("KycUpload", { services });
  };

  return (
    // showAlerts only after onboarding — the global Notifications route only
    // exists once onboardingCompleted (see RootNavigator.tsx: OnboardingStack
    // renders outside the RootStack that registers "Notifications").
    <ScreenContainer title={t("onboarding.verification.title")} showAlerts={onboardingCompleted}>
      {onboardingCompleted ? (
        <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
          {t("onboarding.verification.back")}
        </Text>
      ) : null}
      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{professional?.fullName}</Text>
      <Text style={{ color: colors.textSecondary, ...typography.meta, marginBottom: spacing.sm }}>
        {professional?.email}
      </Text>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && (
        <View style={{ gap: spacing.sm }}>
          {data.credentials.map((c) => (
            <Card key={c.id} style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
                  {SERVICE_LABELS[c.serviceType]}
                </Text>
                <StatusBadge status={c.status} />
              </View>
              {c.status === "rejected" ? (
                <Text style={{ color: colors.danger, ...typography.meta }}>
                  {t("onboarding.verification.rejected")}
                  {c.adminNotes ? ` ${t("onboarding.verification.rejectedReason", { reason: c.adminNotes })}` : ""}
                </Text>
              ) : null}
              {c.expiresAt ? (
                <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                  {t("onboarding.verification.expires", { date: new Date(c.expiresAt).toLocaleDateString() })}
                </Text>
              ) : null}
            </Card>
          ))}

          <Card style={{ gap: spacing.xs }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>{t("onboarding.verification.identity")}</Text>
            <View>
              <StatusBadge status={data.kycStatus} />
            </View>
            {data.kycStatus === "rejected" ? (
              <Text style={{ color: colors.danger, ...typography.meta }}>{t("onboarding.verification.rejected")}</Text>
            ) : null}
          </Card>

          <Card style={{ backgroundColor: colors.surfaceRaised }}>
            <Text style={{ color: colors.textSecondary, ...typography.body }}>{t("onboarding.verification.howItWorks")}</Text>
          </Card>
        </View>
      )}

      {onboardingCompleted ? (
        toFix.length > 0 || kycToFix ? (
          <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
            <Button label={t("onboarding.verification.uploadAgain")} variant="secondary" onPress={uploadAgain} />
            <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("onboarding.verification.uploadHint")}</Text>
          </View>
        ) : null
      ) : (
        <Button label={t("onboarding.verification.goToDashboard")} onPress={markOnboardingCompleted} style={{ marginTop: spacing.md }} />
      )}
    </ScreenContainer>
  );
}
