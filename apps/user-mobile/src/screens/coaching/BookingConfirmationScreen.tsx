import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { DetailRow, ProfessionalRow, RequestStepBar, StateHeading, SummaryCard } from "../../components/GuidanceParts";
import { addToCalendar } from "../../lib/calendarInvite";
import { formatRupees } from "../../lib/money";
import { colors, fonts, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "BookingConfirmation">;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Session booked (Figma coach/08; redesigned 25 Oct 2026): what was paid (fee + GST), the session, and
 * the two next steps, Add to calendar (an .ics file, no calendar permission) and Message. Built from the
 * booking the payment just created (route params, no refetch).
 *
 * Not copied from the Figma: "Sarah has been notified" (nothing sends the coach a notice yet), the
 * payment method ("by UPI": not stored) and a receipt link (no receipts yet; the payment is listed under
 * More › Purchases).
 */
export function BookingConfirmationScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { colors: theme } = useTheme();
  const toast = useToast();
  const { booking } = route.params;
  const [adding, setAdding] = useState(false);
  const first = booking.professionalFullName.split(" ")[0];
  const total = booking.priceCents + booking.gstCents;
  const paid =
    booking.priceCents === 0
      ? "Free session"
      : booking.gstCents > 0
        ? `You paid ${formatRupees(total)} (${formatRupees(booking.priceCents)} + ${formatRupees(booking.gstCents)} GST).`
        : `You paid ${formatRupees(total)}.`;

  const onAddToCalendar = async () => {
    setAdding(true);
    try {
      const ok = await addToCalendar({
        uid: booking.id,
        title: `${booking.offeringLabel} with ${booking.professionalFullName}`,
        start: booking.scheduledAt,
        durationMinutes: booking.durationMinutes,
        description: `Your FynroX session with ${booking.professionalFullName}. Open the app to message them.`,
      });
      if (!ok) toast.show("This phone can't share a calendar file.", "error");
    } catch {
      toast.show("Couldn't create the calendar file. Try again.", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <ScreenContainer title={t("coaching.booking.confirmedTitle")}>
      <View style={{ gap: 18 }}>
        <StateHeading icon="calendar" flow="Professional Guidance / Booked" title="Session booked" body={paid} />
        <ProfessionalRow name={booking.professionalFullName} role="Your professional" />
        <RequestStepBar step={4} />
        <SummaryCard title="Your session">
          <DetailRow label={t("coaching.booking.service")} value={booking.offeringLabel} />
          <DetailRow label={t("coaching.booking.dateTime")} value={formatDateTime(booking.scheduledAt)} />
          <DetailRow label={t("coaching.booking.duration")} value={`${booking.durationMinutes} minutes`} />
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>Your payment is listed in More › Purchases.</Text>
        </SummaryCard>
        {booking.priceCents > 0 ? (
          <SummaryCard tone="accent">
            <Text style={{ color: colors.textSecondary, fontSize: 12, letterSpacing: 0.4 }}>PAID</Text>
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 18 }}>{formatRupees(total)}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
              {booking.gstCents > 0
                ? `${formatRupees(booking.priceCents)} session fee + ${formatRupees(booking.gstCents)} GST · paid to FynroX`
                : `${formatRupees(booking.priceCents)} session fee · paid to FynroX`}
            </Text>
          </SummaryCard>
        ) : null}
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, textAlign: "center" }}>
          {`Professional guidance is separate from programs and app plans. You paid FynroX; FynroX pays ${first} after keeping a fee.`}
        </Text>
        <Button label="Add to calendar" onPress={() => void onAddToCalendar()} loading={adding} disabled={adding} />
        <Button
          label={t("coaching.booking.messageCoach", { name: first })}
          variant="secondary"
          onPress={() => navigation.navigate("MessageThread", { professionalId: booking.professionalId, fullName: booking.professionalFullName })}
        />
        <Pressable onPress={() => navigation.popToTop()} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "center", paddingVertical: spacing.xs }}>
          <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>{t("coaching.booking.backHome")}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}
