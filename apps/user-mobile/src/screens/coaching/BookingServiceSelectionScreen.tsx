import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { SelectCard } from "../../components/SelectCard";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { RazorpayCheckoutModal } from "../../components/RazorpayCheckoutModal";
import { fetchCoachAvailability, fetchCoachProfile, createBooking } from "../../api/coaching";
import { fetchPaymentStatus, retryPaymentActivation } from "../../api/payments";
import { useRazorpayPurchase, usePaymentsConfigured } from "../../lib/useRazorpayPurchase";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import { formatRupees } from "../../lib/money";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "BookingServiceSelection">;

const DAYS_AHEAD = 14;

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayStripLabel(d: Date, isToday: boolean): string {
  if (isToday) return "Today";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatPrice(paise: number) {
  return formatRupees(paise);
}

function serviceLabel(serviceType: string | null) {
  if (serviceType === "fitness") return "Fitness Coaching";
  if (serviceType === "nutrition") return "Nutrition Session";
  return "Combined Session";
}

/**
 * Booking: Service Selection (docs/coach/03-screen-inventory.md §E) — a
 * coach mini-card (reuses CoachProfileDetail's exact `["coaching",
 * "professional", id]` query, so the cache is shared, not double-fetched),
 * a real radio selection across the coach's `ProfessionalServiceOffering`
 * rows (SelectCard, same primitive About You/Training Level use), a
 * 14-day date strip, and a real hourly slot grid computed from actual
 * `Booking` conflicts (GET /coaching/professionals/:id/availability) —
 * not a coach-configured schedule, see coaching.service.ts's doc comment
 * for why. **RESOLVED 5 Sep 2026 (PAY-01):** "Confirm Booking" now opens
 * Razorpay's hosted Checkout for a priced offering (`useRazorpayPurchase`,
 * same hook `ProgramDetailScreen.tsx` uses) rather than activating for
 * free — the server enforces this too (`POST /coaching/bookings` 402s
 * without a verified payment, see coaching.service.ts's `createBooking`).
 * A $0 offering (none seeded today, but the schema allows one) still books
 * directly via the plain `createBooking()` call, same as a free plan or
 * program elsewhere in this app.
 */
export function BookingServiceSelectionScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  // 24 Oct 2026 (Figma coach/12): `rebookPaymentId` picks a new time for a paid session that couldn't be
  // booked. The service is the one already paid for, and confirming books it with that same payment.
  // 25 Oct 2026: `offeringId` / `preferredDate` are what the member asked for when they requested
  // this coach; once the coach has accepted they start already chosen (the member can still change them).
  const { professionalId, rebookPaymentId, offeringId: requestedOfferingId, preferredDate } = route.params;
  const queryClient = useQueryClient();

  const [selectedOfferingId, setSelectedOfferingId] = useState<string | null>(requestedOfferingId ?? null);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(preferredDate ?? toDateKey(new Date()));
  const [selectedTimeIso, setSelectedTimeIso] = useState<string | null>(null);
  const [isBookingFree, setIsBookingFree] = useState(false);
  // 5 Sep 2026 — same coupon field SubscriptionScreen.tsx/ProgramDetailScreen.tsx
  // already have; the backend has always accepted a coupon for any purchase
  // purpose, this screen was just missing the field.
  const [couponCode, setCouponCode] = useState("");

  const { data: profile, isLoading: profileLoading, isError: profileError, refetch: refetchProfile } = useQuery({
    queryKey: ["coaching", "professional", professionalId],
    queryFn: () => fetchCoachProfile(professionalId),
  });

  const rebook = useQuery({
    queryKey: ["payment", rebookPaymentId],
    queryFn: () => fetchPaymentStatus(rebookPaymentId as string),
    enabled: !!rebookPaymentId,
  });
  const rebookOfferingId = rebook.data?.referenceId ?? null;
  useEffect(() => {
    if (rebookOfferingId) setSelectedOfferingId(rebookOfferingId);
  }, [rebookOfferingId]);

  const { data: availability, isLoading: availabilityLoading } = useQuery({
    queryKey: ["coaching", "availability", professionalId, selectedDateKey],
    queryFn: () => fetchCoachAvailability(professionalId, selectedDateKey),
  });

  // A confirmed booking may have just created a new Relationship (or added
  // a session to an existing one) — refresh both queries so My Professional
  // Team and this coach's Total Clients stat reflect it immediately rather
  // than on the next natural refetch. Shared by both the free-booking path
  // below and the paid one (useRazorpayPurchase's onVerified).
  const invalidateAfterBooking = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["coaching", "team"] }),
      queryClient.invalidateQueries({ queryKey: ["coaching", "professional", professionalId] }),
      // U6 (15 Sep 2026) — a confirmed booking also advances the real
      // Relationship state machine (requested/accepted/awaiting_payment/
      // activating -> active), so the status screen needs a fresh read too.
      queryClient.invalidateQueries({ queryKey: ["coaching", "relationships", "status"] }),
    ]);

  const { order, purchase, isPurchasing, onCheckoutSuccess, onCheckoutDismiss } = useRazorpayPurchase({
    onVerified: async (result) => {
      await invalidateAfterBooking();
      if (result.booking) navigation.navigate("BookingConfirmation", { booking: result.booking });
    },
  });
  const { configured: paymentsConfigured } = usePaymentsConfigured();

  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const selectedOffering = profile?.offerings.find((o) => o.id === selectedOfferingId) ?? null;

  const onConfirm = async () => {
    if (!selectedOffering || !selectedTimeIso) return;
    if (rebookPaymentId) {
      setIsBookingFree(true);
      try {
        const result = await retryPaymentActivation(rebookPaymentId, selectedTimeIso);
        await invalidateAfterBooking();
        if (result.booking) navigation.navigate("BookingConfirmation", { booking: result.booking });
        else navigation.goBack();
      } catch (err) {
        Alert.alert("Couldn't book that time", extractErrorMessage(err, "Pick another time and try again. You won't be charged again."));
      } finally {
        setIsBookingFree(false);
      }
      return;
    }
    // Every seeded offering is priced today, but the schema allows a $0
    // one — same free-vs-paid branch ProgramDetailScreen.tsx uses, and
    // matching what the server itself enforces (createBooking() only 402s
    // when priceCents > 0). useRazorpayPurchase's purchase() handles its
    // own errors internally (shows its own Alert on failure), so only the
    // free path below needs its own try/catch.
    if (selectedOffering.priceCents === 0) {
      setIsBookingFree(true);
      try {
        const booking = await createBooking({
          professionalId,
          offeringId: selectedOffering.id,
          scheduledAt: selectedTimeIso,
        });
        await invalidateAfterBooking();
        navigation.navigate("BookingConfirmation", { booking });
      } catch (err) {
        Alert.alert("Couldn't confirm booking", extractErrorMessage(err, "Check your connection and try again."));
      } finally {
        setIsBookingFree(false);
      }
      return;
    }
    purchase("booking", selectedOffering.id, couponCode.trim() || undefined, selectedTimeIso);
  };

  if (profileLoading) {
    return (
      <ScreenContainer title={t("coaching.booking.selectTitle")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (profileError || !profile) {
    return (
      <ScreenContainer title={t("coaching.booking.selectTitle")}>
        <ErrorState onRetry={refetchProfile} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={t("coaching.booking.selectTitle")}>
      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{profile.fullName}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
          {profile.verifiedServices.join(" · ")}
        </Text>
      </Card>

      <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>
        {t("coaching.booking.chooseService")}
      </Text>
      <View style={{ gap: spacing.xs }}>
        {profile.offerings.filter((o) => !rebookPaymentId || o.id === rebookOfferingId).map((o) => (
          <SelectCard
            key={o.id}
            title={`${o.label ?? serviceLabel(o.serviceType)} · ${o.durationMinutes}min`}
            subtitle={
              o.priceCents === 0
                ? "Free"
                : `${formatPrice(o.priceCents)} + ${formatPrice(o.gstCents)} GST = ${formatPrice(o.totalCents)}`
            }
            selected={selectedOfferingId === o.id}
            onPress={() => setSelectedOfferingId(o.id)}
          />
        ))}
      </View>

      <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>{t("coaching.booking.chooseDate")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {days.map((d) => {
            const key = toDateKey(d);
            const isToday = key === toDateKey(new Date());
            return (
              <Chip
                key={key}
                label={dayStripLabel(d, isToday)}
                selected={selectedDateKey === key}
                onPress={() => {
                  setSelectedDateKey(key);
                  setSelectedTimeIso(null);
                }}
              />
            );
          })}
        </View>
      </ScrollView>

      <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>{t("coaching.booking.chooseTime")}</Text>
      {availabilityLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {(availability?.slots ?? []).map((slot) => (
            <View key={slot.time} style={{ opacity: slot.available ? 1 : 0.4 }}>
              <Chip
                label={timeLabel(slot.time)}
                selected={selectedTimeIso === slot.time}
                onPress={() => {
                  if (slot.available) setSelectedTimeIso(slot.time);
                }}
              />
            </View>
          ))}
        </View>
      )}

      {rebookPaymentId ? (
        <Text style={{ color: colors.successText, ...typography.meta, marginTop: spacing.md }}>
          Already paid. Pick a new time; you won't be charged again.
        </Text>
      ) : null}

      {!rebookPaymentId && selectedOffering && selectedOffering.priceCents > 0 && paymentsConfigured ? (
        <TextInput
          value={couponCode}
          onChangeText={(v) => setCouponCode(v.toUpperCase())}
          placeholder={t("coaching.booking.couponPlaceholder")}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          style={{
            color: colors.textPrimary,
            backgroundColor: colors.background,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.sm,
            marginTop: spacing.md,
          }}
        />
      ) : null}

      {/* A paid session can't be bought while online payment is off: say so
          plainly instead of showing a button that does nothing. */}
      {!rebookPaymentId && selectedOffering && selectedOffering.priceCents > 0 && !paymentsConfigured ? (
        <Text style={{ color: colors.warningText, ...typography.meta, marginTop: spacing.lg }}>{t("checkout.paymentsUnavailable")}</Text>
      ) : (
        <Button
          label={rebookPaymentId ? "Book this time" : "Confirm booking"}
          onPress={onConfirm}
          loading={isBookingFree || isPurchasing}
          disabled={!selectedOffering || !selectedTimeIso}
          style={{ marginTop: spacing.lg }}
        />
      )}

      <RazorpayCheckoutModal order={order} onSuccess={onCheckoutSuccess} onDismiss={onCheckoutDismiss} />
    </ScreenContainer>
  );
}
