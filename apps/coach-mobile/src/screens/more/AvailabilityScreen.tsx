import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchLifecycleSummary, updateMyCapacity } from "../../api/professionalLifecycle";
import { fetchOnboardingStatus } from "../../api/professionalOnboarding";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";

const MIN_CAPACITY = 1;
const MAX_CAPACITY = 500;

const LIFECYCLE_LABELS: Record<string, string> = {
  application: "Application",
  verification: "Under Verification",
  approved: "Approved",
  available: "Open for New Clients",
  suspended: "Suspended",
};

const LIFECYCLE_TONES: Record<string, { bg: string; fg: string }> = {
  application: { bg: "#2A2A33", fg: colors.textSecondary },
  verification: { bg: "rgba(245,158,11,0.15)", fg: colors.warning },
  approved: { bg: "rgba(245,158,11,0.15)", fg: colors.warning },
  available: { bg: "rgba(34,197,94,0.15)", fg: colors.success },
  suspended: { bg: "rgba(239,68,68,0.15)", fg: colors.danger },
};

/**
 * Availability & Capacity (R2 Wave 2, 20 Sep 2026) — the real screen this
 * wave's work package calls for: the first coach-mobile UI anywhere to
 * read/write `Professional.lifecycleStatus`/`maxActiveClients` and the
 * `GET/PUT /professionals/me/lifecycle|capacity` endpoints R2 Wave 1 shipped
 * live to production with zero UI callers (see that wave's dated entry in
 * docs/coach/07-open-questions-gaps.md). Reached from the More tab — the
 * one bottom-tab slot with genuinely zero Figma frames to build against
 * (docs/coach/07-open-questions-gaps.md gap §4's "20 Sep 2026" update), so
 * this screen's layout is this build's own honest judgment call, not a
 * Figma-matched design, following the same "real screen, no invented
 * pixel-perfect layout" discipline Calendar/Messages used for their own
 * undesigned tabs.
 *
 * **The `available` precondition, read honestly, not fabricated.**
 * `professionalLifecycle.service.ts`'s own doc comment names the ONE real
 * gate: `available` is reachable only once the professional holds at least
 * one `verified` `ProfessionalCredential` (`meetsAvailablePrecondition`).
 * `GET /professionals/me/lifecycle` doesn't expose a per-credential
 * breakdown, so this screen also calls the existing
 * `GET /professionals/me/onboarding` (already used by the onboarding flow)
 * to show a real "X of Y services verified" count when the professional is
 * `approved` but not yet `available` — not a re-derivation of backend
 * logic, just surfacing data that endpoint already returns.
 */
export function AvailabilityScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [draftCapacity, setDraftCapacity] = useState<string>("");

  const lifecycleQuery = useQuery({ queryKey: ["coach-lifecycle"], queryFn: fetchLifecycleSummary });
  const onboardingQuery = useQuery({ queryKey: ["coach-onboarding-status"], queryFn: fetchOnboardingStatus });

  useEffect(() => {
    if (lifecycleQuery.data) {
      setDraftCapacity(String(lifecycleQuery.data.maxActiveClients));
    }
  }, [lifecycleQuery.data?.maxActiveClients]);

  const saveMutation = useMutation({
    mutationFn: (maxActiveClients: number) => updateMyCapacity({ maxActiveClients }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-lifecycle"] });
      Alert.alert("Saved", "Your client capacity was updated.");
    },
    onError: (err) => Alert.alert("Couldn't save", extractErrorMessage(err, "Please try again.")),
  });

  const summary = lifecycleQuery.data;
  const parsedCapacity = Number.parseInt(draftCapacity, 10);
  const isValidCapacity = Number.isInteger(parsedCapacity) && parsedCapacity >= MIN_CAPACITY && parsedCapacity <= MAX_CAPACITY;
  const isDirty = summary != null && isValidCapacity && parsedCapacity !== summary.maxActiveClients;

  const adjustCapacity = (delta: number) => {
    const base = Number.isInteger(parsedCapacity) ? parsedCapacity : summary?.maxActiveClients ?? MIN_CAPACITY;
    const next = Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, base + delta));
    setDraftCapacity(String(next));
  };

  const verifiedCount = onboardingQuery.data?.credentials.filter((c) => c.status === "verified").length ?? 0;
  const totalCredentials = onboardingQuery.data?.credentials.length ?? 0;

  const precondition = (() => {
    if (!summary) return null;
    switch (summary.lifecycleStatus) {
      case "application":
        return "You haven't submitted a service credential yet — do that from onboarding to start verification.";
      case "verification":
        return "An admin is reviewing your identity check and service credential(s). You'll move to Approved once both clear.";
      case "approved":
        return totalCredentials > 0
          ? `You're approved, but not yet open for new clients — this needs at least one verified service credential (currently ${verifiedCount} of ${totalCredentials} verified). You'll open automatically as soon as one clears.`
          : "You're approved, but not yet open for new clients — this needs at least one verified service credential. You'll open automatically as soon as one clears.";
      case "available":
        return "You're open for new clients — clients can be matched to you up to your capacity below.";
      case "suspended":
        return "Your account is suspended. Contact support to resolve this before you can accept new clients.";
      default:
        return null;
    }
  })();

  return (
    <ScreenContainer title="Availability & Capacity">
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
        ‹ More
      </Text>

      {(lifecycleQuery.isLoading || onboardingQuery.isLoading) && (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
      )}

      {lifecycleQuery.isError && (
        <ErrorState onRetry={() => lifecycleQuery.refetch()} message={extractErrorMessage(lifecycleQuery.error, "Couldn't load your availability status.")} />
      )}

      {summary && (
        <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
          <Card>
            <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Lifecycle Status
            </Text>
            <View
              style={{
                marginTop: spacing.xs,
                alignSelf: "flex-start",
                paddingHorizontal: spacing.sm,
                paddingVertical: 4,
                borderRadius: radius.pill,
                backgroundColor: (LIFECYCLE_TONES[summary.lifecycleStatus] ?? LIFECYCLE_TONES.application).bg,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: (LIFECYCLE_TONES[summary.lifecycleStatus] ?? LIFECYCLE_TONES.application).fg,
                }}
              >
                {LIFECYCLE_LABELS[summary.lifecycleStatus] ?? summary.lifecycleStatus}
              </Text>
            </View>
            {precondition && (
              <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, fontSize: 13, lineHeight: 19 }}>
                {precondition}
              </Text>
            )}
            {summary.status === "suspended" && summary.lifecycleStatus !== "suspended" && (
              <Text style={{ color: colors.danger, marginTop: spacing.sm, fontSize: 13 }}>
                Your account is suspended, which overrides the lifecycle stage above — you can't accept new clients right now.
              </Text>
            )}
          </Card>

          <Card>
            <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Active Clients
            </Text>
            <Text style={{ color: colors.textPrimary, ...typography.h1, marginTop: spacing.xs }}>
              {summary.activeClients} of {summary.maxActiveClients}
            </Text>
            <Text style={{ color: colors.textSecondary, marginTop: 2, fontSize: 13 }}>
              {summary.isAvailableForNewClients
                ? "You have room for at least one more client right now."
                : summary.lifecycleStatus === "available"
                  ? "You're at capacity — raise your limit below to accept more clients."
                  : "New-client matching also requires Open for New Clients status, above."}
            </Text>
          </Card>

          <Card>
            <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Maximum Active Clients
            </Text>
            <Text style={{ color: colors.textSecondary, marginTop: spacing.xs, fontSize: 13 }}>
              The cap on how many clients can be active with you at once ({MIN_CAPACITY}–{MAX_CAPACITY}).
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md, gap: spacing.sm }}>
              <Stepper
                onPress={() => adjustCapacity(-1)}
                disabled={saveMutation.isPending || (Number.isInteger(parsedCapacity) && parsedCapacity <= MIN_CAPACITY)}
                symbol="−"
              />
              <TextInput
                value={draftCapacity}
                onChangeText={(text) => setDraftCapacity(text.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                editable={!saveMutation.isPending}
                style={{
                  flex: 1,
                  textAlign: "center",
                  color: colors.textPrimary,
                  fontSize: 20,
                  fontWeight: "700",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.sm,
                  paddingVertical: spacing.sm,
                  backgroundColor: colors.surfaceRaised,
                }}
              />
              <Stepper
                onPress={() => adjustCapacity(1)}
                disabled={saveMutation.isPending || (Number.isInteger(parsedCapacity) && parsedCapacity >= MAX_CAPACITY)}
                symbol="+"
              />
            </View>

            {!isValidCapacity && draftCapacity.length > 0 && (
              <Text style={{ color: colors.danger, marginTop: spacing.sm, fontSize: 12 }}>
                Enter a whole number between {MIN_CAPACITY} and {MAX_CAPACITY}.
              </Text>
            )}

            <Button
              label="Save"
              onPress={() => saveMutation.mutate(parsedCapacity)}
              loading={saveMutation.isPending}
              disabled={!isDirty || saveMutation.isPending}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        </View>
      )}
    </ScreenContainer>
  );
}

function Stepper({ onPress, disabled, symbol }: { onPress: () => void; disabled?: boolean; symbol: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 44,
        height: 44,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "700" }}>{symbol}</Text>
    </Pressable>
  );
}
