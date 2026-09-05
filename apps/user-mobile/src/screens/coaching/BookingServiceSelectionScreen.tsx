import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { SelectCard } from "../../components/SelectCard";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchCoachAvailability, fetchCoachProfile, createBooking } from "../../api/coaching";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
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

function formatPrice(cents: number) {
  return `₹${(cents / 100).toFixed(2)}`;
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
 * for why. "Confirm Booking" activates immediately with no payment step —
 * the same simplification Subscribe/Program Purchase originally shipped
 * with before Razorpay closed that gap in a later pass; see this
 * screen's api layer / coaching.service.ts for the full reasoning.
 */
export function BookingServiceSelectionScreen({ navigation, route }: Props) {
  const { professionalId } = route.params;
  const queryClient = useQueryClient();

  const [selectedOfferingId, setSelectedOfferingId] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(toDateKey(new Date()));
  const [selectedTimeIso, setSelectedTimeIso] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  const { data: profile, isLoading: profileLoading, isError: profileError, refetch: refetchProfile } = useQuery({
    queryKey: ["coaching", "professional", professionalId],
    queryFn: () => fetchCoachProfile(professionalId),
  });

  const { data: availability, isLoading: availabilityLoading } = useQuery({
    queryKey: ["coaching", "availability", professionalId, selectedDateKey],
    queryFn: () => fetchCoachAvailability(professionalId, selectedDateKey),
  });

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
    setIsBooking(true);
    try {
      const booking = await createBooking({
        professionalId,
        offeringId: selectedOffering.id,
        scheduledAt: selectedTimeIso,
      });
      // A confirmed booking may have just created a new Relationship (or
      // added a session to an existing one) — refresh both queries so My
      // Professional Team and this coach's Total Clients stat reflect it
      // immediately rather than on the next natural refetch.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["coaching", "team"] }),
        queryClient.invalidateQueries({ queryKey: ["coaching", "professional", professionalId] }),
      ]);
      navigation.navigate("BookingConfirmation", { booking });
    } catch (err) {
      Alert.alert("Couldn't confirm booking", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsBooking(false);
    }
  };

  if (profileLoading) {
    return (
      <ScreenContainer title="Book a Session">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (profileError || !profile) {
    return (
      <ScreenContainer title="Book a Session">
        <ErrorState onRetry={refetchProfile} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Book a Session">
      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{profile.fullName}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
          {profile.verifiedServices.join(" · ")}
        </Text>
      </Card>

      <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>
        Choose a service
      </Text>
      <View style={{ gap: spacing.xs }}>
        {profile.offerings.map((o) => (
          <SelectCard
            key={o.id}
            title={`${o.label ?? serviceLabel(o.serviceType)} · ${o.durationMinutes}min`}
            subtitle={formatPrice(o.priceCents)}
            selected={selectedOfferingId === o.id}
            onPress={() => setSelectedOfferingId(o.id)}
          />
        ))}
      </View>

      <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>Choose a date</Text>
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

      <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>Choose a time</Text>
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

      <Button
        label="Confirm Booking"
        onPress={onConfirm}
        loading={isBooking}
        disabled={!selectedOffering || !selectedTimeIso}
        style={{ marginTop: spacing.lg }}
      />
    </ScreenContainer>
  );
}
