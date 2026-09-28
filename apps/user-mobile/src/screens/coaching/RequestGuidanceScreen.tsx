import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Pill } from "../../components/Pill";
import {
  cancelGuidanceRequest,
  createGuidanceRequest,
  fetchMyGuidanceRequests,
  type GuidanceRequest,
  type GuidanceRequestStatus,
} from "../../api/guidanceRequests";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "RequestGuidance">;

/**
 * U-M5 ("Professional request submitted / finding a professional") and
 * U-M7 ("No professional available / request declined -> re-match"),
 * plus the request form itself — the controlled-assignment entry point
 * handoff §2 decision #4 requires in place of browsing.
 *
 * DESIGN-PENDING U-M5, U-M7 — no Figma exists for either. Built with
 * the shared components this app already uses, per the handoff's
 * instruction to "build a plain version with our UI kit" rather than
 * skip the screen.
 *
 * Deliberately shows no professional names, photos, ratings or prices
 * anywhere: the user is asking FynroX for help, not shopping. The only
 * choice offered is fitness vs nutrition, which is the choice §10's
 * relationship limit is expressed in.
 */

const STATUS_COPY: Record<GuidanceRequestStatus, { label: string; tone: "accent" | "success" | "warning" | "neutral"; detail: string }> = {
  open: {
    label: "Finding a professional",
    tone: "accent",
    detail: "We're matching you with a verified professional. This usually takes a day or two.",
  },
  offered: {
    label: "Waiting on a professional",
    tone: "accent",
    detail: "We've sent your request to a professional and are waiting for them to accept.",
  },
  fulfilled: {
    label: "Matched",
    tone: "success",
    detail: "A professional accepted. You'll find them under your professional team.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
    detail: "You cancelled this request. You can raise a new one any time.",
  },
  // U-M7. Stated plainly rather than dressed up: the user asked for
  // something and did not get it, and a vague "still looking" here would
  // be a lie that costs them weeks.
  exhausted: {
    label: "No match yet",
    tone: "warning",
    detail:
      "We couldn't find an available professional for this request. Our team has been notified and will get in touch.",
  },
};

const SERVICES: Array<{ value: "fitness" | "nutrition"; label: string }> = [
  { value: "fitness", label: "Fitness" },
  { value: "nutrition", label: "Nutrition" },
];

export function RequestGuidanceScreen(_props: Props) {
  const queryClient = useQueryClient();
  const [serviceType, setServiceType] = useState<"fitness" | "nutrition">("fitness");
  const [note, setNote] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["guidanceRequests"],
    queryFn: fetchMyGuidanceRequests,
  });

  const create = useMutation({
    mutationFn: () => createGuidanceRequest({ serviceType, userNote: note.trim() || undefined }),
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["guidanceRequests"] });
    },
    onError: (err) =>
      Alert.alert("Couldn't send your request", extractErrorMessage(err, "Check your connection and try again.")),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelGuidanceRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guidanceRequests"] }),
    onError: (err) =>
      Alert.alert("Couldn't cancel", extractErrorMessage(err, "Check your connection and try again.")),
  });

  if (isLoading) {
    return (
      <ScreenContainer title="Professional guidance">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }
  if (isError) {
    return (
      <ScreenContainer title="Professional guidance">
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  const requests = data ?? [];
  const live = requests.filter((r) => r.status === "open" || r.status === "offered");
  const past = requests.filter((r) => r.status !== "open" && r.status !== "offered");
  const canRequest = live.length === 0;

  return (
    <ScreenContainer
      title="Professional guidance"
      subtitle="Ask for a verified fitness or nutrition professional"
    >
      {live.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Your request</Text>
          {live.map((r) => (
            <RequestCard key={r.id} request={r} onCancel={() => cancel.mutate(r.id)} cancelling={cancel.isPending} />
          ))}
        </View>
      ) : null}

      {canRequest ? (
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>What do you need help with?</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            {SERVICES.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                selected={serviceType === s.value}
                onPress={() => setServiceType(s.value)}
              />
            ))}
          </View>

          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.md }}>
            Anything the professional should know (optional)
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            maxLength={1000}
            placeholder="Goals, injuries, schedule…"
            placeholderTextColor={colors.textMuted}
            style={{
              color: colors.textPrimary,
              backgroundColor: colors.surfaceRaised,
              borderRadius: radius.md,
              padding: spacing.sm,
              marginTop: spacing.xs,
              minHeight: 80,
              textAlignVertical: "top",
            }}
          />

          <Button
            label="Send request"
            onPress={() => create.mutate()}
            loading={create.isPending}
            style={{ marginTop: spacing.md }}
          />
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
            We match you with a professional from our verified network. You only pay once they accept.
          </Text>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Earlier requests</Text>
          {past.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </View>
      ) : null}

      {requests.length === 0 && !canRequest ? (
        <EmptyState title="No requests yet" subtitle="Ask for guidance and we'll match you with a professional." />
      ) : null}
    </ScreenContainer>
  );
}

function RequestCard({
  request,
  onCancel,
  cancelling,
}: {
  request: GuidanceRequest;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const copy = STATUS_COPY[request.status];
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>
          {request.serviceType === "fitness" ? "Fitness" : "Nutrition"}
        </Text>
        <Pill label={copy.label} tone={copy.tone} />
      </View>
      <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>{copy.detail}</Text>

      {/* U-M7's re-match visibility. Shown only once it has actually
          happened — a "0 attempts so far" line would be noise. */}
      {request.rematchCount > 0 && request.status !== "fulfilled" ? (
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
          {request.rematchCount} professional{request.rematchCount === 1 ? "" : "s"} couldn't take this on — we're still
          looking.
        </Text>
      ) : null}

      {request.closedReason ? (
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
          {request.closedReason}
        </Text>
      ) : null}

      {onCancel ? (
        <Button
          label="Cancel request"
          variant="secondary"
          onPress={onCancel}
          loading={cancelling}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </Card>
  );
}
