import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
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
 */
export function VerificationStatusScreen() {
  const { professional, markOnboardingCompleted } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["professional-onboarding-status"],
    queryFn: fetchOnboardingStatus,
  });

  return (
    // showAlerts=false — the global Notifications route only exists once
    // onboardingCompleted (see RootNavigator.tsx: OnboardingStack renders
    // outside the RootStack that registers "Notifications"), so this
    // pre-onboarding screen can't navigate there yet.
    <ScreenContainer title="Verification Status" showAlerts={false}>
      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{professional?.fullName}</Text>
      <Text style={{ color: colors.textSecondary, ...typography.meta, marginBottom: spacing.sm }}>
        {professional?.email}
      </Text>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && (
        <View style={{ gap: spacing.sm }}>
          {data.credentials.map((c) => (
            <Card key={c.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
                {SERVICE_LABELS[c.serviceType]}
              </Text>
              <StatusBadge status={c.status} />
            </Card>
          ))}

          <Card>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>Identity Verification</Text>
            <View style={{ marginTop: spacing.xs }}>
              <StatusBadge status={data.kycStatus} />
            </View>
          </Card>

          <Card style={{ backgroundColor: colors.surfaceRaised }}>
            <Text style={{ color: colors.textSecondary, ...typography.body }}>
              You can start accepting clients for any service marked Verified right away — services still Pending
              will unlock automatically once reviewed.
            </Text>
          </Card>
        </View>
      )}

      <Button label="Go to Dashboard" onPress={markOnboardingCompleted} style={{ marginTop: spacing.md }} />
    </ScreenContainer>
  );
}
