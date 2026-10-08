import React from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { BodyText, SummaryCard } from "../../components/GuidanceParts";
import { fetchBookingSummary } from "../../api/coachSessions";
import { formatDay, formatSessionPrice } from "../../lib/sessionFormat";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "SessionSummary">;

/**
 * Session Complete (Figma 04): status tag + date, professional, service,
 * duration, and the professional's published notes (or an honest "not
 * published yet"). The design's "Shared session context" and "Professional
 * recommendation" cards are omitted: no per-session shared context or
 * coach-authored recommendation exists in this build. Session mode (video /
 * in person) is not stored either.
 */
export function SessionSummaryScreen({ navigation, route }: Props) {
  const { bookingId } = route.params;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "bookings", bookingId, "summary"],
    queryFn: () => fetchBookingSummary(bookingId),
  });

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const state =
    data == null
      ? null
      : data.status === "cancelled"
        ? { label: "CANCELLED", fg: colors.textSecondary, bg: colors.surfaceHigh, title: "Session Cancelled" }
        : new Date(data.scheduledAt).getTime() > Date.now()
          ? { label: "UPCOMING", fg: colors.accent, bg: colors.accentSoft, title: "Session Details" }
          : { label: "COMPLETED", fg: colors.success, bg: colors.successSoft, title: "Session Complete" };

  return (
    <ScreenContainer title={state?.title ?? "Session"}>
      <BackButton onPress={() => navigation.goBack()} />
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
                <Text style={{ color: state.fg, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6 }}>{state.label}</Text>
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
                {data.durationMinutes} minutes · {formatSessionPrice(data.priceCents, null)} ·{" "}
                {new Date(data.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
          </View>

          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Professional Notes</Text>
          <SummaryCard>
            {data.summaryText ? (
              <>
                <BodyText>{`"${data.summaryText}"`}</BodyText>
                {data.summaryPublishedAt ? (
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>Shared {formatDay(data.summaryPublishedAt)}</Text>
                ) : null}
              </>
            ) : (
              <BodyText>Your professional hasn't published notes for this session yet. Check back after the session.</BodyText>
            )}
          </SummaryCard>

          <Pressable
            onPress={() => navigation.navigate("BookingServiceSelection", { professionalId: data.professionalId })}
            accessibilityRole="button"
            accessibilityLabel="Book Another Session"
            style={{ height: 52, borderRadius: radius.md, backgroundColor: colors.aiAccent, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontFamily: fonts.displayBold, fontSize: 16 }}>Book Another Session</Text>
          </Pressable>
          <Button
            label="Message Professional"
            variant="secondary"
            onPress={() => navigation.navigate("MessageThread", { professionalId: data.professionalId, fullName: data.professionalFullName })}
          />
        </>
      )}
    </ScreenContainer>
  );
}
