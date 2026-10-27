import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CancelBookingResponse } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { useToast } from "../../components/Toast";
import { BodyText, DetailRow, SummaryCard } from "../../components/GuidanceParts";
import {
  SESSION_CREDIT_VALIDITY_DAYS,
  acceptProposal,
  cancelBooking,
  declineProposal,
  fetchBookingSummary,
  fetchSessionRating,
} from "../../api/coachSessions";
import { confirmAction } from "../../lib/confirm";
import { extractErrorMessage } from "../../lib/apiError";
import { formatRupees } from "../../lib/money";
import { formatDay } from "../../lib/sessionFormat";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "SessionSummary">;

/** "Tue, 28 Oct, 6:00 pm" in the device's locale, as the reschedule screen shows times. */
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Session Complete (Figma 04): status tag + date, professional, service,
 * duration, and the professional's published notes (or an honest "not
 * published yet"). The design's "Shared session context" and "Professional
 * recommendation" cards are omitted: no per-session shared context or
 * coach-authored recommendation exists in this build. Session mode (video /
 * in person) is not stored either.
 *
 * Booking changes (27 Oct 2026, the owner's policy in apps/api bookingChanges.service.ts): an upcoming
 * session can be cancelled any time before it starts for a session credit worth what was paid (no money
 * back to the card), and a coach's proposed new time is accepted or declined here (declining cancels it
 * for the same credit).
 */
/** "Your rating ★★★★☆ · Edit", or "Rate this session" before there is one. */
function RatingRow({ bookingId, onRate }: { bookingId: string; onRate: () => void }) {
  const { data } = useQuery({ queryKey: ["coaching", "bookings", bookingId, "rating"], queryFn: () => fetchSessionRating(bookingId) });
  if (data === undefined) return null;
  if (!data) return <Button label="Rate this session" variant="secondary" onPress={onRate} />;
  return (
    <Pressable
      onPress={onRate}
      accessibilityRole="button"
      accessibilityLabel={`Your rating, ${data.stars} of 5. Edit`}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
    >
      <Text style={{ color: colors.textSecondary, ...typography.meta }}>Your rating</Text>
      <View style={{ flexDirection: "row", gap: 2, flex: 1 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Icon key={n} name="star" size={16} color={n <= data.stars ? colors.warning : colors.textMuted} fill={n <= data.stars ? colors.warning : "none"} />
        ))}
      </View>
      <Text style={{ color: colors.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>Edit</Text>
    </Pressable>
  );
}

export function SessionSummaryScreen({ navigation, route }: Props) {
  const { bookingId } = route.params;
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"cancel" | "accept" | "decline" | null>(null);
  // The credit a cancel or decline just gave, shown until the member leaves this screen.
  const [cancelResult, setCancelResult] = useState<CancelBookingResponse | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "bookings", bookingId, "summary"],
    queryFn: () => fetchBookingSummary(bookingId),
  });

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // The same keys the reschedule flow refreshes (this summary sits under ["coaching", "bookings"]), plus credits.
  const refreshAfterChange = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["coaching", "bookings"] }),
      queryClient.invalidateQueries({ queryKey: ["coaching", "team"] }),
      queryClient.invalidateQueries({ queryKey: ["coaching", "credits"] }),
    ]);

  /** Cancel, or decline the coach's new time: either way the session is cancelled for a credit. */
  const cancelForCredit = async (kind: "cancel" | "decline") => {
    setBusy(kind);
    try {
      const result = kind === "cancel" ? await cancelBooking(bookingId) : await declineProposal(bookingId);
      setCancelResult(result);
      await refreshAfterChange();
      toast.show(t("bookingChanges.cancel.done"), "success");
    } catch (err) {
      toast.show(extractErrorMessage(err, kind === "cancel" ? t("bookingChanges.cancel.failed") : t("bookingChanges.proposal.declineFailed")), "error");
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  const onCancel = () =>
    confirmAction(
      t("bookingChanges.cancel.confirmTitle"),
      t("bookingChanges.cancel.confirmBody", { days: SESSION_CREDIT_VALIDITY_DAYS }),
      t("bookingChanges.cancel.action"),
      () => void cancelForCredit("cancel"),
      true,
      t("bookingChanges.cancel.keep"),
    );

  const onDecline = () =>
    confirmAction(
      t("bookingChanges.proposal.declineTitle"),
      t("bookingChanges.proposal.declineBody", { days: SESSION_CREDIT_VALIDITY_DAYS }),
      t("bookingChanges.proposal.declineConfirm"),
      () => void cancelForCredit("decline"),
    );

  const onAccept = async () => {
    setBusy("accept");
    try {
      const result = await acceptProposal(bookingId);
      await refreshAfterChange();
      toast.show(t("bookingChanges.proposal.accepted", { when: when(result.scheduledAt) }), "success");
    } catch (err) {
      toast.show(extractErrorMessage(err, t("bookingChanges.proposal.acceptFailed")), "error");
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  const cancelledByText = (by: string | null | undefined) => {
    if (by === "member") return t("bookingChanges.cancelled.byMember");
    if (by === "coach") return t("bookingChanges.cancelled.byCoach");
    if (by === "admin") return t("bookingChanges.cancelled.byAdmin");
    return t("bookingChanges.cancelled.unknown");
  };

  const state =
    data == null
      ? null
      : data.status === "cancelled"
        ? { label: "CANCELLED", fg: colors.textSecondary, bg: colors.surfaceHigh, title: "Session Cancelled" }
        : new Date(data.scheduledAt).getTime() > Date.now()
          ? { label: "UPCOMING", fg: colors.accent, bg: colors.accentSoft, title: "Session Details" }
          : { label: "COMPLETED", fg: colors.success, bg: colors.successSoft, title: "Session Complete" };

  // An unanswered proposal lapses once the session starts, so it's only offered on an upcoming session.
  const proposedAt = state?.label === "UPCOMING" ? (data?.proposedScheduledAt ?? null) : null;

  return (
    <ScreenContainer title={state?.title ?? "Session"} onBack={() => navigation.goBack()}>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data || !state ? (
        <Skeleton height={160} />
      ) : (
        <>
          <View
            style={{
              gap: spacing.xs,
              padding: spacing.md,
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ backgroundColor: state.bg, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: state.fg, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.6 }}>{state.label}</Text>
              </View>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>{formatDay(data.scheduledAt)}</Text>
            </View>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{data.professionalFullName}</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {data.serviceType === "nutrition" ? "Nutrition Professional" : data.serviceType === "fitness" ? "Fitness Professional" : "Professional"}
            </Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Service · {data.offeringLabel}</Text>
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xs }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Icon name="clock" size={14} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                {data.durationMinutes} minutes ·{" "}
                {new Date(data.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
            {state.label === "CANCELLED" ? (
              <>
                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xs }} />
                <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>{cancelledByText(data.cancelledBy)}</Text>
                {data.cancelledAt ? (
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("bookingChanges.cancelled.on", { date: formatDay(data.cancelledAt) })}</Text>
                ) : null}
              </>
            ) : null}
          </View>

          {/* The credit a cancel / decline just gave: its value and when it runs out. */}
          {cancelResult ? (
            <View style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.success }}>
              {cancelResult.credit ? (
                <>
                  <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t("bookingChanges.credit.title")}</Text>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>
                    {t("bookingChanges.credit.amount", { amount: formatRupees(cancelResult.credit.amountCents) })}
                  </Text>
                  <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                    {t("bookingChanges.credit.expires", { date: formatDay(cancelResult.credit.expiresAt) })}
                  </Text>
                </>
              ) : (
                <Text style={{ color: colors.textSecondary, ...typography.meta }}>{t("bookingChanges.credit.none")}</Text>
              )}
            </View>
          ) : null}

          {/* The coach asked to move this session: accept (it moves) or decline (cancelled for a credit). */}
          {proposedAt ? (
            <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Icon name="clock" size={16} color={colors.warningText} />
                <Text style={{ color: colors.textPrimary, ...typography.h3, flex: 1 }}>{t("bookingChanges.proposal.title")}</Text>
              </View>
              <BodyText>{t("bookingChanges.proposal.body", { name: data.professionalFullName.split(" ")[0] })}</BodyText>
              <DetailRow label={t("bookingChanges.proposal.from")} value={when(data.scheduledAt)} valueColor={colors.textSecondary} />
              <DetailRow label={t("bookingChanges.proposal.to")} value={when(proposedAt)} valueColor={colors.textPrimary} />
              <Button label={t("bookingChanges.proposal.accept")} size="compact" onPress={() => void onAccept()} loading={busy === "accept"} disabled={busy !== null} />
              <Button label={t("bookingChanges.proposal.decline")} variant="secondary" size="compact" onPress={onDecline} loading={busy === "decline"} disabled={busy !== null} />
            </View>
          ) : null}

          {/* Figma coach/15 (25 Oct 2026): an upcoming session can be moved until 24 hours before it. */}
          {state.label === "UPCOMING" ? (
            new Date(data.scheduledAt).getTime() - Date.now() >= 24 * 60 * 60 * 1000 ? (
              <Button
                label="Reschedule"
                variant="secondary"
                onPress={() =>
                  navigation.navigate("RescheduleSession", {
                    bookingId,
                    professionalId: data.professionalId,
                    professionalFullName: data.professionalFullName,
                    scheduledAt: data.scheduledAt,
                    offeringLabel: data.offeringLabel,
                  })
                }
              />
            ) : (
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                {`Less than 24 hours to go, so this session can't be moved here. Message ${data.professionalFullName.split(" ")[0]} if something comes up.`}
              </Text>
            )
          ) : null}

          {/* Booking changes (27 Oct 2026): cancelling is allowed any time before the start, for a credit. */}
          {state.label === "UPCOMING" ? (
            <View style={{ gap: spacing.xs }}>
              <Pressable
                onPress={onCancel}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={t("bookingChanges.cancel.action")}
                accessibilityState={{ disabled: busy !== null, busy: busy === "cancel" }}
                style={({ pressed }) => ({
                  height: 48,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.danger,
                  backgroundColor: pressed ? colors.dangerSoft : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: busy !== null && busy !== "cancel" ? 0.5 : 1,
                })}
              >
                {busy === "cancel" ? (
                  <ActivityIndicator color={colors.dangerText} />
                ) : (
                  <Text style={{ color: colors.dangerText, fontFamily: fonts.bodySemi, fontSize: 15 }}>{t("bookingChanges.cancel.action")}</Text>
                )}
              </Pressable>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("bookingChanges.cancel.hint")}</Text>
            </View>
          ) : null}

          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Written by {data.professionalFullName.split(" ")[0]} after your session</Text>
          <SummaryCard>
            {data.summaryText ? (
              <>
                <BodyText>{`"${data.summaryText}"`}</BodyText>
                {data.summaryPublishedAt ? (
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>Shared {formatDay(data.summaryPublishedAt)}</Text>
                ) : null}
              </>
            ) : (
              <BodyText>{`${data.professionalFullName.split(" ")[0]} hasn't added notes for this session yet. Check back after the session.`}</BodyText>
            )}
          </SummaryCard>

          {/* Figma coach/11: rate a session once it has taken place, on its own screen (25 Oct 2026). */}
          {state.label === "COMPLETED" ? (
            <RatingRow
              bookingId={bookingId}
              onRate={() =>
                navigation.navigate("RateSession", {
                  bookingId,
                  coachName: data.professionalFullName,
                  context: `${data.offeringLabel} · ${formatDay(data.scheduledAt)} · ${data.durationMinutes} min`,
                })
              }
            />
          ) : null}

          <Pressable
            onPress={() => navigation.navigate("BookingServiceSelection", { professionalId: data.professionalId })}
            accessibilityRole="button"
            accessibilityLabel="Book Another Session"
            style={{ height: 52, borderRadius: radius.md, backgroundColor: colors.aiAccent, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontFamily: fonts.displayBold, fontSize: 16 }}>Book Another Session</Text>
          </Pressable>
          <Button
            label={`Message ${data.professionalFullName.split(" ")[0]}`}
            variant="secondary"
            onPress={() => navigation.navigate("MessageThread", { professionalId: data.professionalId, fullName: data.professionalFullName })}
          />
        </>
      )}
    </ScreenContainer>
  );
}
