import React from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "BookingConfirmation">;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Booking Confirmation (docs/coach/03-screen-inventory.md §E) — a real
 * session-details card from the just-created Booking (passed via route
 * params, no refetch needed). "amount" is a real, honestly-displayed
 * `priceCents` — no payment was actually collected this pass, see
 * coaching.service.ts's doc comment. Two navigation calls interpret the
 * design's own CTAs, since no dedicated "My Bookings" list screen exists
 * among the seven adopted screens: "View My Bookings" opens My
 * Professional Team (which already shows real last/next session dates
 * per relationship), and "Back to Home" returns to the More hub — same
 * "reasonable reading of an underspecified design element" precedent as
 * Workout History's Compare action.
 */
export function BookingConfirmationScreen({ navigation, route }: Props) {
  const { booking } = route.params;

  return (
    <ScreenContainer title="Booking Confirmed">
      <Card style={{ alignItems: "center" }}>
        <Text style={{ color: colors.success, ...typography.h1 }}>Booked ✓</Text>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" }}>
          Your session with {booking.professionalFullName} is confirmed.
        </Text>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Row label="Coach" value={booking.professionalFullName} />
        <Row label="Service" value={booking.offeringLabel} />
        <Row label="Date & Time" value={formatDateTime(booking.scheduledAt)} />
        <Row label="Duration" value={`${booking.durationMinutes} min`} />
        <Row label="Amount" value={formatPrice(booking.priceCents)} last />
      </Card>

      <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
        A reminder for this session isn't scheduled automatically yet — add one from Reminders if you'd like a
        notification beforehand.
      </Text>

      <Button
        label="View My Bookings"
        onPress={() => navigation.navigate("MyProfessionalTeam")}
        style={{ marginTop: spacing.lg }}
      />
      <Button
        label="Back to Home"
        variant="secondary"
        onPress={() => navigation.popToTop()}
        style={{ marginTop: spacing.sm }}
      />
    </ScreenContainer>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: spacing.xs,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ color: colors.textSecondary }}>{label}</Text>
      <Text style={{ color: colors.textPrimary }}>{value}</Text>
    </View>
  );
}
