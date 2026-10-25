import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { DetailRow, ProfessionalRow, SummaryCard } from "../../components/GuidanceParts";
import { fetchCoachAvailability } from "../../api/coaching";
import { rescheduleBooking } from "../../api/coachSessions";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "RescheduleSession">;

const DAYS_AHEAD = 14;
/** The availability API takes the UTC calendar day (its grid is whole UTC hours), as the booking screen does. */
const toDateKey = (d: Date) => d.toISOString().slice(0, 10);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * Reschedule a session (Figma coach/15; decided 25 Oct 2026: moving only, up to 24 hours before). Pick a
 * day and one of the professional's free times; the fee and payment stay as they are. Cancelling with a
 * refund isn't offered: that money policy is the owner's to set.
 */
export function RescheduleSessionScreen({ navigation, route }: Props) {
  const { bookingId, professionalId, professionalFullName, scheduledAt, offeringLabel } = route.params;
  const { colors: theme } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => new Date(Date.now() + i * 86_400_000)), []);
  const [dateKey, setDateKey] = useState(toDateKey(days[1]));
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const first = professionalFullName.split(" ")[0];

  const availability = useQuery({
    queryKey: ["coaching", "availability", professionalId, dateKey],
    queryFn: () => fetchCoachAvailability(professionalId, dateKey),
  });

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      await rescheduleBooking(bookingId, picked);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["coaching", "bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["coaching", "team"] }),
      ]);
      toast.show(`Moved to ${when(picked)}`, "success");
      navigation.goBack();
    } catch (err) {
      toast.show(extractErrorMessage(err, "Couldn't move the session. Pick another time."), "error");
      await availability.refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer title="Reschedule" onBack={() => navigation.goBack()}>
      <ProfessionalRow name={professionalFullName} role={offeringLabel} size={44} />
      <SummaryCard>
        <DetailRow label="Now" value={when(scheduledAt)} />
        <DetailRow label="New time" value={picked ? when(picked) : "Pick a day and time below"} valueColor={picked ? theme.accentText : colors.textSecondary} />
      </SummaryCard>

      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 16 }}>Day</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {days.map((d) => {
          const key = toDateKey(d);
          const on = key === dateKey;
          return (
            <Pressable
              key={key}
              onPress={() => {
                setDateKey(key);
                setPicked(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              style={{
                width: 48,
                height: 56,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: on ? theme.accent : colors.border,
                backgroundColor: on ? theme.accent : colors.surface,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <Text style={{ color: on ? theme.textOnAccent : colors.textSecondary, fontSize: 12 }}>{d.toLocaleDateString(undefined, { weekday: "short" })}</Text>
              <Text style={{ color: on ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 16 }}>{String(d.getDate()).padStart(2, "0")}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 16 }}>Time</Text>
      {availability.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(availability.data?.slots ?? []).map((slot) => {
            const on = picked === slot.time;
            return (
              <Pressable
                key={slot.time}
                disabled={!slot.available}
                onPress={() => setPicked(slot.time)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: !slot.available }}
                accessibilityLabel={`${timeLabel(slot.time)}${slot.available ? "" : ", taken"}`}
                style={{
                  minWidth: 84,
                  height: 44,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: on ? theme.accent : colors.border,
                  backgroundColor: on ? theme.accentSoft : colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: slot.available ? 1 : 0.35,
                }}
              >
                <Text style={{ color: on ? theme.accentText : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{timeLabel(slot.time)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
        {`You can move a session up to 24 hours before it starts. The fee you paid stays the same, and ${first} sees the new time.`}
      </Text>
      <Button label={picked ? `Move to ${when(picked)}` : "Move session"} onPress={() => void save()} loading={saving} disabled={!picked || saving} />
    </ScreenContainer>
  );
}
