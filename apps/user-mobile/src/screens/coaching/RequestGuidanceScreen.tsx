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
import { useTranslation } from "react-i18next";
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
 * anywhere: the user is asking Fynrox for help, not shopping. The only
 * choice offered is fitness vs nutrition, which is the choice §10's
 * relationship limit is expressed in.
 */

/**
 * Status -> catalogue key. The copy itself lives in `i18n/locales/en.ts`
 * so it can be translated; this map only records which key belongs to
 * which state, which is code, not copy.
 */
const STATUS_KEY: Record<GuidanceRequestStatus, { tone: "accent" | "success" | "warning" | "neutral" }> = {
  open: { tone: "accent" },
  offered: { tone: "accent" },
  fulfilled: { tone: "success" },
  cancelled: { tone: "neutral" },
  // U-M7. Stated plainly rather than dressed up: the user asked for
  // something and did not get it, and a vague "still looking" here would
  // be a lie that costs them weeks.
  exhausted: { tone: "warning" },
};

const SERVICES: Array<{ value: "fitness" | "nutrition"; label: string }> = [
  { value: "fitness", label: "Fitness" },
  { value: "nutrition", label: "Nutrition" },
];

export function RequestGuidanceScreen(_props: Props) {
  const { t } = useTranslation();
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
      Alert.alert(t("guidance.sendFailed"), extractErrorMessage(err, t("common.checkConnection"))),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelGuidanceRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guidanceRequests"] }),
    onError: (err) =>
      Alert.alert(t("guidance.cancelFailed"), extractErrorMessage(err, t("common.checkConnection"))),
  });

  if (isLoading) {
    return (
      <ScreenContainer title={t("guidance.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }
  if (isError) {
    return (
      <ScreenContainer title={t("guidance.title")}>
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  const requests = data ?? [];
  const live = requests.filter((r) => r.status === "open" || r.status === "offered");
  const past = requests.filter((r) => r.status !== "open" && r.status !== "offered");
  const canRequest = live.length === 0;

  return (
    <ScreenContainer title={t("guidance.title")} subtitle={t("guidance.subtitle")}>
      {live.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("guidance.yourRequest")}</Text>
          {live.map((r) => (
            <RequestCard key={r.id} request={r} onCancel={() => cancel.mutate(r.id)} cancelling={cancel.isPending} />
          ))}
        </View>
      ) : null}

      {canRequest ? (
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t("guidance.whatHelp")}</Text>
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
            {t("guidance.noteLabel")}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            maxLength={1000}
            placeholder={t("guidance.notePlaceholder")}
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
            label={t("guidance.send")}
            onPress={() => create.mutate()}
            loading={create.isPending}
            style={{ marginTop: spacing.md }}
          />
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
            {t("guidance.onlyPayOnAccept")}
          </Text>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("guidance.earlier")}</Text>
          {past.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </View>
      ) : null}

      {requests.length === 0 && !canRequest ? (
        <EmptyState title={t("coaching.requests.emptyTitle")} subtitle={t("coaching.requests.emptySubtitle")} />
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
  const { t } = useTranslation();
  const tone = STATUS_KEY[request.status].tone;
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>
          {request.serviceType === "fitness" ? "Fitness" : "Nutrition"}
        </Text>
        <Pill label={t(`guidance.status.${request.status}.label`)} tone={tone} />
      </View>
      <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
        {t(`guidance.status.${request.status}.detail`)}
      </Text>

      {/* U-M7's re-match visibility. Shown only once it has actually
          happened — a "0 attempts so far" line would be noise. */}
      {request.rematchCount > 0 && request.status !== "fulfilled" ? (
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
          {/* Pluralised by i18next's CLDR rules, not a ternary — the
              ternary is correct in English and wrong in most of the ten
              languages this app offers. */}
          {t("guidance.rematch", { count: request.rematchCount })}
        </Text>
      ) : null}

      {request.closedReason ? (
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
          {request.closedReason}
        </Text>
      ) : null}

      {onCancel ? (
        <Button
          label={t("guidance.cancel")}
          variant="secondary"
          onPress={onCancel}
          loading={cancelling}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </Card>
  );
}
