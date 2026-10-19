import React from "react";
import { useTranslation } from "react-i18next";
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
import { COACH_BROWSING_ENABLED } from "../../lib/coachEntry";

type Props = NativeStackScreenProps<MoreStackParamList, "ProfessionalRelationship">;

// Copy for these three lived in module-level functions, which cannot
// reach the `t` hook. Each now returns a KEY and the component resolves
// it — `statusPresentation` keeps the colour and icon, which are design
// decisions rather than copy.
function serviceLabelKey(serviceType: string) {
  return serviceType === "fitness"
    ? "coaching.relationship.serviceFitness"
    : "coaching.relationship.serviceNutrition";
}

// The real six-stage lifecycle schema.prisma's RelationshipStatus enum
// models (see that enum's own doc comment) — `ended` is excluded from this
// screen entirely (GET /coaching/relationships/status never returns it,
// same as "no relationship" looked before this screen existed).
const STEPS: RelationshipStatus[] = ["requested", "accepted", "awaiting_payment", "activating", "active"];

// Oct 2026 (Figma Professional 05b/06/12): the status endpoint returns every
// non-ended status, so each one gets real copy. Finished outcomes (the API
// keeps them for 30 days; a coach's decline is `declined`) are listed under
// "Earlier"; the rest stay with the in-flight request. `stuck` activating rows
// and `activation_failed` rows show the payment ID and open a billing ticket.
const PAST: ReadonlySet<RelationshipStatus> = new Set(["declined", "expired", "completed"]);
const NOTE_KEY: Partial<Record<RelationshipStatus, string>> = {
  requested: "coaching.relationship.requestedNote",
  offered: "coaching.relationship.offeredNote",
  declined: "coaching.relationship.declinedNote",
  expired: "coaching.relationship.expiredNote",
  activation_failed: "coaching.relationship.activationFailedNote",
  changing: "coaching.relationship.changingNote",
  completed: "coaching.relationship.completedNote",
};

function statusPresentation(status: RelationshipStatus): { color: string; icon: IconName } {
  switch (status) {
    case "requested":
      return { color: colors.aiText, icon: "sparkles" };
    case "accepted":
      return { color: colors.warningText, icon: "check" };
    case "awaiting_payment":
      return { color: colors.warningText, icon: "clock" };
    case "activating":
      return { color: colors.warningText, icon: "refresh-cw" };
    case "offered":
      return { color: colors.aiText, icon: "sparkles" };
    case "changing":
      return { color: colors.warningText, icon: "swap" };
    case "activation_failed":
      return { color: colors.dangerText, icon: "alert-triangle" };
    case "declined":
      return { color: colors.textSecondary, icon: "circle-x" };
    case "expired":
      return { color: colors.textSecondary, icon: "clock" };
    case "completed":
      return { color: colors.successText, icon: "check-check" };
    case "active":
    default:
      return { color: colors.successText, icon: "check" };
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
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "relationships", "status"],
    queryFn: fetchRelationshipStatus,
  });

  if (isLoading) {
    return (
      <ScreenContainer title={t("coaching.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer title={t("coaching.title")}>
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  // Browsing when it is switched on; otherwise the request the FynroX team matches.
  const findCoach = () =>
    COACH_BROWSING_ENABLED ? navigation.navigate("CoachDiscovery", undefined) : navigation.navigate("RequestGuidance");

  const inFlight = data.relationships.filter((r) => r.status !== "active" && !PAST.has(r.status));
  const past = data.relationships.filter((r) => PAST.has(r.status));
  const active = data.relationships.filter((r) => r.status === "active");

  return (
    <ScreenContainer title={t("coaching.title")} subtitle={t("coaching.subtitle")}>
      {data.relationships.length === 0 ? (
        <EmptyState
          title={t("coaching.relationship.emptyTitle")}
          subtitle={t("coaching.relationship.emptySubtitle")}
          actionLabel={t("coaching.team.findCoach")}
          onAction={findCoach}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {inFlight.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("coaching.relationship.yourRequest")}</Text>
              {inFlight.map((r) => (
                <RelationshipStatusCard
                  key={r.relationshipId}
                  item={r}
                  // Always offered once the coach has accepted — not tied to
                  // the browsing flag, or a hire stalled halfway with no way
                  // to pay. The API refuses the payment itself if it must.
                  onContinuePayment={
                    r.status === "accepted" || r.status === "awaiting_payment"
                      ? () => navigation.navigate("BookingServiceSelection", { professionalId: r.professionalId })
                      : undefined
                  }
                  onContactSupport={
                    r.status === "activation_failed" || r.stuck
                      ? () => navigation.navigate("SupportTicketForm", { category: "billing" })
                      : undefined
                  }
                />
              ))}
            </View>
          ) : null}

          {past.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("coaching.relationship.earlier")}</Text>
              {past.map((r) => (
                <RelationshipStatusCard
                  key={r.relationshipId}
                  item={r}
                  onAskAgain={r.status === "declined" || r.status === "expired" ? findCoach : undefined}
                />
              ))}
            </View>
          ) : null}

          {active.length > 0 ? (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs }}>
                <Icon name="check" size={18} color={colors.success} />
                <Text style={{ color: colors.successText, ...typography.label }}>{t("coaching.relationship.step.active")}</Text>
              </View>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>
                {active.length === 1 ? "You have 1 coach working with you" : `You have ${active.length} coaches working with you`}
              </Text>
              <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                {active.map((r) => `${r.professionalFullName} (${t(serviceLabelKey(r.serviceType))})`).join(" · ")}
              </Text>
              <Button
                label={t("coaching.relationship.viewTeam")}
                onPress={() => navigation.navigate("MyProfessionalTeam")}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}
        </View>
      )}

      {/* Handoff §2 decision #4: "Controlled assignment via 'Request
          professional guidance'. No browsing, ratings or per-session
          prices." With the marketplace flag off (the R1 default), the
          only route into a relationship is a request an admin matches.
          The browse path is kept behind the flag rather than deleted —
          it is working, tested code, and whether to retire it is the
          product team's call, not this change's. */}
      <Button
        label={t("coaching.team.findCoach")}
        variant="secondary"
        onPress={findCoach}
        style={{ marginTop: spacing.lg }}
      />
    </ScreenContainer>
  );
}

function RelationshipStatusCard({
  item,
  onContinuePayment,
  onAskAgain,
  onContactSupport,
}: {
  item: RelationshipStatusItem;
  onContinuePayment?: () => void;
  onAskAgain?: () => void;
  onContactSupport?: () => void;
}) {
  const { t } = useTranslation();
  // A stuck `activating` row reads like a failure (the API flags it after 15 minutes).
  const presentation = item.stuck ? statusPresentation("activation_failed") : statusPresentation(item.status);
  const currentIndex = STEPS.indexOf(item.status);

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
        <Icon name={presentation.icon} size={18} color={presentation.color} />
        <Text style={{ color: presentation.color, ...typography.label }}>
          {item.stuck ? t("coaching.relationship.stuckStatus") : t(`coaching.relationship.status.${item.status}`)}
        </Text>
      </View>
      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{item.professionalFullName}</Text>
      <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>{t(serviceLabelKey(item.serviceType))}</Text>

      {/* The stepper only describes the main path; off-path states would show it all grey. */}
      {currentIndex >= 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md }}>
          {STEPS.map((step, i) => (
            <Pill
              key={step}
              label={t(`coaching.relationship.step.${step}`)}
              tone={i < currentIndex ? "success" : i === currentIndex ? "warning" : "neutral"}
              icon={i < currentIndex ? "check" : undefined}
            />
          ))}
        </View>
      ) : null}

      <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.sm }}>
        {item.stuck ? t("coaching.relationship.stuckNote") : t(NOTE_KEY[item.status] ?? "coaching.relationship.notActiveNote")}
      </Text>
      {item.paymentId ? (
        <Text selectable style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
          {t("coaching.relationship.paymentId", { id: item.paymentId })}
        </Text>
      ) : null}

      {onContinuePayment ? (
        <Button label={t("coaching.relationship.continueToPayment")} onPress={onContinuePayment} style={{ marginTop: spacing.md }} />
      ) : null}
      {onContactSupport ? (
        <Button label={t("coaching.relationship.contactSupport")} onPress={onContactSupport} style={{ marginTop: spacing.md }} />
      ) : null}
      {onAskAgain ? (
        <Button label={t("coaching.relationship.askAgain")} variant="secondary" onPress={onAskAgain} style={{ marginTop: spacing.md }} />
      ) : null}
    </Card>
  );
}
