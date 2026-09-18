import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RelationshipStatus, RelationshipStatusItem } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon, IconName } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchRelationshipStatus } from "../../api/coaching";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "ProfessionalRelationship">;

function serviceLabel(serviceType: string) {
  return serviceType === "fitness" ? "Fitness Coaching" : "Nutrition Coaching";
}

// The real six-stage lifecycle schema.prisma's RelationshipStatus enum
// models (see that enum's own doc comment) — `ended` is excluded from this
// screen entirely (GET /coaching/relationships/status never returns it,
// same as "no relationship" looked before this screen existed).
const STEPS: RelationshipStatus[] = ["requested", "accepted", "awaiting_payment", "activating", "active"];

function stepLabel(step: RelationshipStatus): string {
  switch (step) {
    case "requested":
      return "Requested";
    case "accepted":
      return "Accepted";
    case "awaiting_payment":
      return "Awaiting Payment";
    case "activating":
      return "Activating";
    case "active":
    default:
      return "Active";
  }
}

function statusPresentation(status: RelationshipStatus): { label: string; color: string; icon: IconName } {
  switch (status) {
    case "requested":
      return { label: "Waiting for the coach to respond", color: colors.aiAccent, icon: "sparkles" };
    case "accepted":
      return { label: "Accepted — set up your payment to continue", color: colors.warning, icon: "check" };
    case "awaiting_payment":
      return { label: "Awaiting payment", color: colors.warning, icon: "clock" };
    case "activating":
      return { label: "Activating your relationship…", color: colors.warning, icon: "refresh-cw" };
    case "active":
    default:
      return { label: "Active", color: colors.success, icon: "check" };
  }
}

/**
 * "Professional guidance request / status / active relationship entry"
 * (R1 work package §4) — U6, Developer 1's own half of this milestone.
 * The real hub screen this app never had: before this, a user could only
 * ever see a fully `active` relationship (My Professional Team) or nothing
 * at all — there was no way to check status while a request was
 * requested/accepted/awaiting a Razorpay Checkout the user backed out of/
 * mid-payment-capture, all real, now-persisted states (see
 * coaching.service.ts's claimRelationship doc comment). The MoreScreen
 * "Coaching" row routes here now (was CoachDiscovery directly) — this
 * screen is the entry point; Discovery and My Professional Team are both
 * still reachable from it, unchanged.
 *
 * Error & Recovery §9 ("must never present professional service as
 * active") is the hard constraint this screen is built around: an
 * in-flight relationship (anything short of `active`) is always rendered
 * with a real state stepper and an explicit "not active yet" framing,
 * never folded into or confused with the active-team summary below it.
 *
 * **16 Sep 2026 (gap §56):** `requested` is no longer an instantaneous,
 * auto-advancing state — a real coach now has to review and accept it
 * (apps/coach-mobile's new Pending Requests screen) before it becomes
 * `accepted`. `requested`'s own copy here is deliberately framed as
 * normal waiting, never as an error or something the user needs to act
 * on — see statusPresentation()/RelationshipStatusCard's own "requested"
 * branches below.
 */
export function ProfessionalRelationshipScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "relationships", "status"],
    queryFn: fetchRelationshipStatus,
  });

  if (isLoading) {
    return (
      <ScreenContainer title="Coaching">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer title="Coaching">
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  const inFlight = data.relationships.filter((r) => r.status !== "active");
  const active = data.relationships.filter((r) => r.status === "active");

  return (
    <ScreenContainer title="Coaching" subtitle="Request guidance and track your professional relationship">
      {data.relationships.length === 0 ? (
        <EmptyState
          title="No professional relationship yet"
          subtitle="Request guidance from a verified fitness or nutrition professional to get started."
          actionLabel="Find a Professional"
          onAction={() => navigation.navigate("CoachDiscovery", undefined)}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {inFlight.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Your Request</Text>
              {inFlight.map((r) => (
                <RelationshipStatusCard
                  key={r.relationshipId}
                  item={r}
                  onContinuePayment={
                    r.status === "accepted" || r.status === "awaiting_payment"
                      ? () => navigation.navigate("BookingServiceSelection", { professionalId: r.professionalId })
                      : undefined
                  }
                />
              ))}
            </View>
          ) : null}

          {active.length > 0 ? (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs }}>
                <Icon name="check" size={18} color={colors.success} />
                <Text style={{ color: colors.success, ...typography.label }}>Active</Text>
              </View>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>
                You have {active.length} active professional relationship{active.length === 1 ? "" : "s"}
              </Text>
              <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                {active.map((r) => `${r.professionalFullName} (${serviceLabel(r.serviceType)})`).join(" · ")}
              </Text>
              <Button
                label="View My Professional Team"
                onPress={() => navigation.navigate("MyProfessionalTeam")}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}
        </View>
      )}

      <Button
        label="Find a Professional"
        variant="secondary"
        onPress={() => navigation.navigate("CoachDiscovery", undefined)}
        style={{ marginTop: spacing.lg }}
      />
    </ScreenContainer>
  );
}

function RelationshipStatusCard({
  item,
  onContinuePayment,
}: {
  item: RelationshipStatusItem;
  onContinuePayment?: () => void;
}) {
  const presentation = statusPresentation(item.status);
  const currentIndex = STEPS.indexOf(item.status);

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
        <Icon name={presentation.icon} size={18} color={presentation.color} />
        <Text style={{ color: presentation.color, ...typography.label }}>{presentation.label}</Text>
      </View>
      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{item.professionalFullName}</Text>
      <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>{serviceLabel(item.serviceType)}</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md }}>
        {STEPS.map((step, i) => (
          <Pill
            key={step}
            label={stepLabel(step)}
            tone={i < currentIndex ? "success" : i === currentIndex ? "warning" : "neutral"}
            icon={i < currentIndex ? "check" : undefined}
          />
        ))}
      </View>

      <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.sm }}>
        {item.status === "requested"
          ? "Nothing's wrong — the coach hasn't reviewed your request yet. You'll be able to continue as soon as they accept."
          : "Not an active professional relationship yet — full access unlocks once this reaches Active."}
      </Text>

      {onContinuePayment ? (
        <Button label="Continue to Payment" onPress={onContinuePayment} style={{ marginTop: spacing.md }} />
      ) : null}
    </Card>
  );
}
