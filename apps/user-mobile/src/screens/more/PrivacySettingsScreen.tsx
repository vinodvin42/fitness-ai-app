import React, { useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Consent, ConsentType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchConsents, updateConsent } from "../../api/consents";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "PrivacySettings">;

const CONSENT_COPY: Record<ConsentType, { title: string; description: string }> = {
  marketing_emails: {
    title: "Marketing emails",
    description: "Promotional emails about new programs, features, and offers. Off by default.",
  },
  data_analytics: {
    title: "Product analytics",
    description: "Lets us use your in-app activity to improve the product. This app works the same either way.",
  },
  health_data_processing: {
    title: "Health data processing",
    description:
      "Covers processing the medical conditions, injuries, body measurements, and workout/meal data you provide so this app's real features (plans, tracking, safety review) can use it.",
  },
};

/**
 * §4 Privacy/Consent settings (R1 Developer 1, 18 Sep 2026) — the real
 * screen this build never had before: `adminPrivacy.service.ts`'s own top
 * comment used to say "Not built: consent management" outright, and gap
 * §50 left `consent.changed` (§8) genuinely unbuilt for exactly that
 * reason. Closes both: a real `Consent` model backs every toggle below,
 * and each flip fires a real `consent.changed` event
 * (users.service.ts#updateConsent).
 *
 * Reads the real current state from the server on every open (`useQuery`,
 * not a locally-guessed default) — `Consent.updatedAt === null` means this
 * type has never been explicitly set (rendered as off, with no "last
 * updated" line), which is a genuinely different state from a user having
 * explicitly turned something off. See users.service.ts's `listConsents`
 * doc comment.
 */
export function PrivacySettingsScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [pendingWithdrawal, setPendingWithdrawal] = useState<ConsentType | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["users", "consents"],
    queryFn: fetchConsents,
  });

  const mutation = useMutation({
    mutationFn: updateConsent,
    onSuccess: (consent) => {
      queryClient.setQueryData<Consent[] | undefined>(["users", "consents"], (prev) =>
        prev ? prev.map((c) => (c.type === consent.type ? consent : c)) : prev,
      );
    },
  });

  // Withdrawing health/analytics consent goes through a confirm sheet, then
  // the "Withdrawal confirmed" screen (onboarding/10). Marketing emails and
  // re-granting stay a plain toggle.
  const onToggle = (type: ConsentType, granted: boolean) => {
    if (!granted && type !== "marketing_emails") {
      setPendingWithdrawal(type);
      return;
    }
    mutation.mutate({ type, granted });
  };

  const confirmWithdrawal = () => {
    const type = pendingWithdrawal;
    if (!type) return;
    setPendingWithdrawal(null);
    mutation.mutate({ type, granted: false }, { onSuccess: () => navigation.navigate("ConsentWithdrawn", { type }) });
  };

  return (
    <ScreenContainer title="Privacy & Consent">
      <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
        Control what 23PrimeFit is allowed to do with your data. Each of these is a real, independent setting — you
        can change your mind at any time.
      </Text>

      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <View style={{ gap: spacing.md }}>
          {(data ?? []).map((consent) => {
            const copy = CONSENT_COPY[consent.type];
            return (
              <Card key={consent.type}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1, marginRight: spacing.md }}>
                    <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{copy.title}</Text>
                    <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>{copy.description}</Text>
                    <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
                      {consent.updatedAt ? `Last updated ${new Date(consent.updatedAt).toLocaleDateString()}` : "Not yet set"}
                    </Text>
                  </View>
                  <Switch
                    value={consent.granted}
                    onValueChange={(value) => onToggle(consent.type, value)}
                    disabled={mutation.isPending}
                    trackColor={{ true: colors.accent, false: colors.border }}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <BottomSheet visible={pendingWithdrawal !== null} onClose={() => setPendingWithdrawal(null)} title="Withdraw consent?">
        <Text style={{ color: colors.textSecondary, ...typography.body }}>
          {pendingWithdrawal ? CONSENT_COPY[pendingWithdrawal].title : ""} will stop being used from now on. Some features
          may become less personalised. You can turn it back on any time.
        </Text>
        <Button label="Withdraw consent" onPress={confirmWithdrawal} />
        <Button label="Keep it on" variant="secondary" onPress={() => setPendingWithdrawal(null)} />
      </BottomSheet>

      {mutation.isError ? (
        <Text style={{ color: colors.danger, marginTop: spacing.md }}>
          Couldn't save that preference. Check your connection and try again.
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
