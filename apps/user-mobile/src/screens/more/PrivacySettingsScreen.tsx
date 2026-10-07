import React, { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Consent, ConsentType, ProfessionalDataSharing, UpdateProfessionalDataSharingInput } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { ActionRow, GroupCard, SectionLabel, ToggleRow } from "../../components/SettingsParts";
import { fetchConsents, updateConsent } from "../../api/consents";
import { fetchSharing, updateSharing } from "../../api/dataSharing";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
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

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

/**
 * Figma Settings 12 - Data & Privacy. "You decide who sees what" intro, then
 * one "What <professional> can see" group per professional you have an active
 * relationship with (Daily Step Count / Food logs / Sleep & recovery - real
 * per-professional flags that gate what that professional's client summary
 * returns), a Health-data consent entry that expands the real consent
 * toggles (with the withdrawal confirmation flow), Download all my data, and
 * a Delete account card.
 *
 * 18 Sep 2026 origin: the consent toggles are backed by the real `Consent`
 * model; `Consent.updatedAt === null` means never explicitly set.
 */
export function PrivacySettingsScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [pendingWithdrawal, setPendingWithdrawal] = useState<ConsentType | null>(null);
  const [showConsents, setShowConsents] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const consents = useQuery({ queryKey: ["users", "consents"], queryFn: fetchConsents });
  const sharing = useQuery({ queryKey: ["coaching", "sharing"], queryFn: fetchSharing });

  const consentMutation = useMutation({
    mutationFn: updateConsent,
    onSuccess: (consent) => {
      queryClient.setQueryData<Consent[] | undefined>(["users", "consents"], (prev) =>
        prev ? prev.map((c) => (c.type === consent.type ? consent : c)) : prev,
      );
    },
  });

  const sharingMutation = useMutation({
    mutationFn: ({ professionalId, input }: { professionalId: string; input: UpdateProfessionalDataSharingInput }) =>
      updateSharing(professionalId, input),
    onMutate: async ({ professionalId, input }) => {
      setSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["coaching", "sharing"] });
      const prev = queryClient.getQueryData<ProfessionalDataSharing[]>(["coaching", "sharing"]);
      if (prev) {
        queryClient.setQueryData<ProfessionalDataSharing[]>(
          ["coaching", "sharing"],
          prev.map((p) => (p.professionalId === professionalId ? { ...p, ...input } : p)),
        );
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["coaching", "sharing"], ctx.prev);
      setSaveError(extractErrorMessage(err, "Couldn't save that choice. Check your connection and try again."));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["coaching", "sharing"] }),
  });

  // Withdrawing health/analytics consent goes through a confirm sheet, then
  // the "Withdrawal confirmed" screen. Marketing emails and re-granting stay a
  // plain toggle.
  const onToggleConsent = (type: ConsentType, granted: boolean) => {
    if (!granted && type !== "marketing_emails") {
      setPendingWithdrawal(type);
      return;
    }
    consentMutation.mutate({ type, granted });
  };

  const confirmWithdrawal = () => {
    const type = pendingWithdrawal;
    if (!type) return;
    setPendingWithdrawal(null);
    consentMutation.mutate({ type, granted: false }, { onSuccess: () => navigation.navigate("ConsentWithdrawn", { type }) });
  };

  const healthGranted = (consents.data ?? []).find((c) => c.type === "health_data_processing")?.granted ?? false;

  return (
    <ScreenContainer title="Data & Privacy">
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>You decide who sees what</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>
          You choose what each professional sees. Partners never see your personal or health data.
        </Text>
      </View>

      {sharing.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : sharing.isError ? (
        <ErrorState onRetry={() => sharing.refetch()} />
      ) : (sharing.data ?? []).length === 0 ? (
        <>
          <SectionLabel text="What your professionals can see" />
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>
              You don't have an active professional yet. When you do, you'll choose here what they can see.
            </Text>
          </View>
        </>
      ) : (
        (sharing.data ?? []).map((p) => {
          const name = firstName(p.professionalFullName);
          const set = (input: UpdateProfessionalDataSharingInput) => sharingMutation.mutate({ professionalId: p.professionalId, input });
          return (
            <View key={p.professionalId} style={{ gap: spacing.sm }}>
              <SectionLabel text={`What ${p.professionalFullName} can see`} />
              <GroupCard>
                <ToggleRow
                  title="Daily Step Count"
                  subtitle={p.steps ? `Shared with ${name} for your guided program.` : `Not shared with ${name}.`}
                  value={p.steps}
                  onValueChange={(v) => set({ steps: v })}
                />
                <ToggleRow
                  title="Food logs"
                  subtitle={p.foodLogs ? `Shared with ${name} so they can coach your nutrition.` : `Not shared with ${name}.`}
                  value={p.foodLogs}
                  onValueChange={(v) => set({ foodLogs: v })}
                />
                <ToggleRow
                  title="Sleep & recovery"
                  subtitle={p.sleepRecovery ? `Shared with ${name} as context only, never as a score.` : `Not shared with ${name}.`}
                  value={p.sleepRecovery}
                  onValueChange={(v) => set({ sleepRecovery: v })}
                />
              </GroupCard>
            </View>
          );
        })
      )}
      {(sharing.data ?? []).length > 0 && !healthGranted && !consents.isLoading ? (
        <Text style={{ color: colors.warning, ...typography.meta, lineHeight: 17 }}>
          Health-data consent is off, so your professionals can't see any of this until you turn it on below.
        </Text>
      ) : null}
      {saveError ? <Text style={{ color: colors.danger, ...typography.meta }}>{saveError}</Text> : null}

      <ActionRow
        label={`Health-data consent - ${showConsents ? "Hide" : "Manage / withdraw"}`}
        icon="shield-check"
        onPress={() => setShowConsents((v) => !v)}
      />
      {showConsents ? (
        consents.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : consents.isError ? (
          <ErrorState onRetry={() => consents.refetch()} />
        ) : (
          <GroupCard>
            {(consents.data ?? []).map((consent) => {
              const copy = CONSENT_COPY[consent.type];
              return (
                <ToggleRow
                  key={consent.type}
                  title={copy.title}
                  subtitle={`${copy.description} ${consent.updatedAt ? `Last updated ${new Date(consent.updatedAt).toLocaleDateString()}.` : "Not yet set."}`}
                  value={consent.granted}
                  disabled={consentMutation.isPending}
                  onValueChange={(v) => onToggleConsent(consent.type, v)}
                />
              );
            })}
          </GroupCard>
        )
      ) : null}

      <ActionRow label="Download all my data (PDF + CSV)" icon="download" onPress={() => navigation.navigate("DownloadData")} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.danger,
          padding: spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.danger, fontFamily: fonts.bodyBold, fontSize: 14 }}>Delete account</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 11, lineHeight: 15 }}>
            Permanently deletes your account and data. This can't be undone.
          </Text>
        </View>
        <Button
          label="Delete"
          variant="secondary"
          onPress={() => navigation.navigate("Security", { focus: "delete" })}
          style={{ height: 36, paddingHorizontal: spacing.md, borderColor: colors.danger, backgroundColor: colors.dangerSoft }}
        />
      </View>

      <BottomSheet visible={pendingWithdrawal !== null} onClose={() => setPendingWithdrawal(null)} title="Withdraw consent?">
        <Text style={{ color: colors.textSecondary, ...typography.body }}>
          {pendingWithdrawal ? CONSENT_COPY[pendingWithdrawal].title : ""} will stop being used from now on. Some features
          may become less personalised. You can turn it back on any time.
        </Text>
        <Button label="Withdraw consent" onPress={confirmWithdrawal} />
        <Button label="Keep it on" variant="secondary" onPress={() => setPendingWithdrawal(null)} />
      </BottomSheet>

      {consentMutation.isError ? (
        <Text style={{ color: colors.danger }}>Couldn't save that preference. Check your connection and try again.</Text>
      ) : null}
    </ScreenContainer>
  );
}
