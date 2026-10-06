import React from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Avatar } from "../../components/Avatar";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { BodyText, SummaryCard } from "../../components/GuidanceParts";
import { fetchMyTeam, fetchRelationshipStatus } from "../../api/coaching";
import { fetchQuoteRequests } from "../../api/coachSessions";
import { formatDay, QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, quoteServiceLabel } from "../../lib/quoteFormat";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MyProfessionalTeam">;

const SERVICE_NAME: Record<ProfessionalServiceType, string> = { fitness: "Fitness", nutrition: "Nutrition" };

const RELATIONSHIP_LABEL: Record<string, string> = {
  requested: "Waiting for them to accept",
  accepted: "Accepted, payment needed",
  awaiting_payment: "Awaiting payment",
  activating: "Activating",
};

/**
 * My Professionals (Figma 09): one card per relationship (active, or still
 * being set up), open guidance requests, and per-service "Change ... professional"
 * links. The design's "Sharing" row and "Manage sharing" button are omitted:
 * there is no per-professional sharing setting in this build (data consent is a
 * single account-level setting). "Remove a professional" is omitted too: users
 * can only ask for a change (reviewed by support), they cannot end a relationship
 * themselves, so a "removal ends access straight away" claim would be false.
 */
export function MyProfessionalTeamScreen({ navigation }: Props) {
  const team = useQuery({ queryKey: ["coaching", "team"], queryFn: fetchMyTeam });
  const rels = useQuery({ queryKey: ["coaching", "relationships", "status"], queryFn: fetchRelationshipStatus });
  const quotes = useQuery({ queryKey: ["coaching", "quoteRequests"], queryFn: fetchQuoteRequests });

  useFocusEffect(
    React.useCallback(() => {
      team.refetch();
      rels.refetch();
      quotes.refetch();
    }, []),
  );

  const header = (
    <>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>
        You can have one fitness professional and one nutrition professional, or just one of them. Each only sees the data covered by your
        health-data consent.
      </Text>
    </>
  );

  if (team.isLoading || rels.isLoading) {
    return (
      <ScreenContainer title="My Professionals">
        {header}
        <Skeleton height={140} />
        <Skeleton height={140} />
      </ScreenContainer>
    );
  }
  if (team.isError || !team.data) {
    return (
      <ScreenContainer title="My Professionals">
        {header}
        <ErrorState onRetry={() => team.refetch()} />
      </ScreenContainer>
    );
  }

  const active = team.data.team;
  const inFlight = (rels.data?.relationships ?? []).filter((r) => r.status !== "active");
  const openQuotes = (quotes.data ?? []).filter((q) => ["pending", "quoted", "accepted"].includes(q.status));
  const empty = active.length === 0 && inFlight.length === 0 && openQuotes.length === 0;

  return (
    <ScreenContainer title="My Professionals">
      {header}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button label="Sessions" variant="secondary" onPress={() => navigation.navigate("CoachSessions")} style={{ height: 40, flex: 1 }} />
        <Button label="Requests" variant="secondary" onPress={() => navigation.navigate("Quotes")} style={{ height: 40, flex: 1 }} />
        <Button label="Messages" variant="secondary" onPress={() => navigation.navigate("Conversations")} style={{ height: 40, flex: 1 }} />
      </View>

      {empty ? (
        <EmptyState
          title="No professionals yet"
          subtitle="Request guidance from a verified fitness or nutrition professional and they'll show up here."
          actionLabel="Find a professional"
          onAction={() => navigation.navigate("CoachDiscovery", undefined)}
        />
      ) : null}

      {active.map((m) => (
        <ProCard key={m.relationshipId} label={SERVICE_NAME[m.serviceType].toUpperCase()}>
          <ProHeader name={m.professionalFullName} sub={m.specializationTags.slice(0, 2).join(" · ") || `${SERVICE_NAME[m.serviceType]} professional`} />
          <Pill label={`Active since ${formatDay(m.createdAt)}`} tone="success" />
          <Row label="Service" value={`${SERVICE_NAME[m.serviceType]} coaching`} />
          <Row label="Last session" value={m.lastSessionAt ? formatDay(m.lastSessionAt) : "None yet"} />
          <Row label="Next session" value={m.nextSessionAt ? formatDay(m.nextSessionAt) : "None booked"} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              label="Message"
              onPress={() => navigation.navigate("MessageThread", { professionalId: m.professionalId, fullName: m.professionalFullName })}
              style={{ height: 40, flex: 1 }}
            />
            <Button
              label="Book"
              variant="secondary"
              onPress={() => navigation.navigate("BookingServiceSelection", { professionalId: m.professionalId })}
              style={{ height: 40, flex: 1 }}
            />
          </View>
        </ProCard>
      ))}

      {inFlight.map((r) => (
        <ProCard key={r.relationshipId} label={SERVICE_NAME[r.serviceType].toUpperCase()}>
          <ProHeader name={r.professionalFullName} sub={`${SERVICE_NAME[r.serviceType]} professional`} />
          <Pill label={RELATIONSHIP_LABEL[r.status] ?? "In progress"} tone="warning" icon="clock" />
          <Row label="Request" value={`${SERVICE_NAME[r.serviceType]} coaching`} />
          <Button label="View request" onPress={() => navigation.navigate("ProfessionalRelationship")} style={{ height: 40 }} />
        </ProCard>
      ))}

      {openQuotes.length > 0 ? (
        <>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Guidance requests</Text>
          {openQuotes.map((q) => (
            <ProCard key={q.id} label={quoteServiceLabel(q.serviceType).toUpperCase()}>
              <ProHeader name={q.professionalFullName ?? "Professional"} sub={`Sent ${formatDay(q.createdAt)}`} />
              <Pill label={QUOTE_STATUS_LABEL[q.status]} tone={QUOTE_STATUS_TONE[q.status]} />
              <Button label="View request" onPress={() => navigation.navigate("QuoteDetail", { quoteId: q.id })} style={{ height: 40 }} />
            </ProCard>
          ))}
        </>
      ) : null}

      {active.length > 0 ? (
        <SummaryCard>
          {active.map((m) => (
            <Text
              key={m.relationshipId}
              onPress={() =>
                navigation.navigate("ChangeProfessional", {
                  relationshipId: m.relationshipId,
                  professionalFullName: m.professionalFullName,
                  serviceType: m.serviceType,
                })
              }
              accessibilityRole="link"
              style={{ color: colors.textPrimary, ...typography.label, paddingVertical: 4 }}
            >
              Change {SERVICE_NAME[m.serviceType].toLowerCase()} professional  ›
            </Text>
          ))}
        </SummaryCard>
      ) : null}

      {active.length > 0 ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
          <Icon name="lock" size={14} color={colors.textMuted} />
          <BodyText muted>A change request is reviewed by support. Your current professional stays until it is processed, and your history stays with you.</BodyText>
        </View>
      ) : null}

      <Button label="Find a professional" variant="secondary" onPress={() => navigation.navigate("CoachDiscovery", undefined)} />

      {team.data.recommended.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Recommended professionals</Text>
          {team.data.recommended.map((coach) => (
            <ProCard key={coach.id}>
              <ProHeader name={coach.fullName} sub={coach.yearsExperience != null ? `${coach.yearsExperience} yrs experience` : "Verified professional"} />
              <Button
                label="View profile"
                variant="secondary"
                onPress={() => navigation.navigate("CoachProfileDetail", { professionalId: coach.id })}
                style={{ height: 40 }}
              />
            </ProCard>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function ProCard({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        gap: 10,
        padding: spacing.md,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {label ? <Text style={{ color: colors.accent, ...typography.caption, letterSpacing: 0.8 }}>{label}</Text> : null}
      {children}
    </View>
  );
}

function ProHeader({ name, sub }: { name: string; sub: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <Avatar name={name} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{name}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>{sub}</Text>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, ...typography.label, flex: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
}
