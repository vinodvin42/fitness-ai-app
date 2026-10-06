import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { QuoteServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { Chip } from "../../components/Chip";
import { Pill } from "../../components/Pill";
import { TextField } from "../../components/TextField";
import { Avatar } from "../../components/Avatar";
import { ErrorState } from "../../components/ErrorState";
import { Skeleton } from "../../components/Skeleton";
import { BodyText, SummaryCard } from "../../components/GuidanceParts";
import { useToast } from "../../components/Toast";
import { fetchCoachProfile } from "../../api/coaching";
import { createQuoteRequest } from "../../api/coachSessions";
import { extractErrorMessage } from "../../lib/apiError";
import { firstName, professionalRoleLabel } from "../../lib/quoteFormat";
import { BRAND_NAME } from "../../lib/brand";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "RequestQuote">;

const REQUEST_TYPES: Array<{ value: string; label: string; hint: string }> = [
  { value: "Single session", label: "Single Session", hint: "Fee confirmed after acceptance" },
  { value: "Program review", label: "Program review", hint: "Coach reviews your request" },
  { value: "Ongoing support request", label: "Ongoing support request", hint: "Custom scope and fee" },
];

const DAY_COUNT = 7;

/** Next 7 days as selectable date chips (Figma Professional Profile "Preferred Date"). */
function nextDays(): Date[] {
  const out: Date[] = [];
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  for (let i = 1; i <= DAY_COUNT; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}

/**
 * Professional Guidance 02: choose a preferred date and a request type, then
 * send a quote request (POST /coaching/quote-requests). No payment is taken.
 * The request type becomes the opening line of the message the professional
 * reads; the preferred date is sent as `preferredAt` (informational).
 * Also used for "Request again" (prefilled from the earlier request).
 */
export function RequestQuoteScreen({ navigation, route }: Props) {
  const { professionalId, professionalName, serviceType: initialService } = route.params;
  const queryClient = useQueryClient();
  const toast = useToast();
  const { colors: theme } = useTheme();
  const days = useMemo(nextDays, []);
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [requestType, setRequestType] = useState<string>(REQUEST_TYPES[0].value);
  const [serviceType, setServiceType] = useState<QuoteServiceType | null>(initialService ?? null);
  const [note, setNote] = useState("");

  const profile = useQuery({ queryKey: ["coaching", "professional", professionalId], queryFn: () => fetchCoachProfile(professionalId) });
  const services = profile.data?.verifiedServices ?? [];
  const effectiveService: QuoteServiceType | null =
    serviceType ?? (services.length === 1 ? services[0] : services.length > 1 ? "combined" : "fitness");
  const name = profile.data?.fullName ?? professionalName ?? "your professional";
  const first = firstName(name);

  const submit = useMutation({
    mutationFn: () => {
      const lines = [`${requestType} request.`];
      if (dayIndex != null) lines.push(`Preferred date: ${days[dayIndex].toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.`);
      if (note.trim()) lines.push(note.trim());
      return createQuoteRequest({
        professionalId,
        serviceType: effectiveService as QuoteServiceType,
        message: lines.join("\n"),
        preferredAt: dayIndex != null ? days[dayIndex].toISOString() : undefined,
      });
    },
    onSuccess: (q) => {
      queryClient.invalidateQueries({ queryKey: ["coaching", "quoteRequests"] });
      navigation.replace("QuoteDetail", { quoteId: q.id });
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't send that request."), "error"),
  });

  return (
    <ScreenContainer title="Professional Profile">
      <BackButton onPress={() => navigation.goBack()} />
      {profile.isError ? (
        <ErrorState onRetry={() => profile.refetch()} />
      ) : profile.isLoading ? (
        <Skeleton height={120} />
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Avatar name={name} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22 }}>{name}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>{professionalRoleLabel(services)}</Text>
            </View>
          </View>
          {(profile.data?.specializationTags ?? []).length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {(profile.data?.specializationTags ?? []).map((t) => (
                <Pill key={t} label={t} />
              ))}
            </View>
          ) : null}

          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Preferred Date</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {days.map((d, i) => {
              const sel = dayIndex === i;
              return (
                <Pressable
                  key={d.toISOString()}
                  onPress={() => setDayIndex(sel ? null : i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 8,
                    borderRadius: radius.sm,
                    backgroundColor: sel ? theme.accent : colors.surface,
                    borderWidth: 1,
                    borderColor: sel ? theme.accent : colors.border,
                  }}
                >
                  <Text style={{ color: sel ? "#fff" : colors.textMuted, fontFamily: fonts.body, fontSize: 10 }}>
                    {d.toLocaleDateString("en-GB", { weekday: "short" })}
                  </Text>
                  <Text style={{ color: sel ? "#fff" : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </View>

          {services.length > 1 ? (
            <>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Service</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                <Chip label="Fitness" selected={effectiveService === "fitness"} onPress={() => setServiceType("fitness")} />
                <Chip label="Nutrition" selected={effectiveService === "nutrition"} onPress={() => setServiceType("nutrition")} />
                <Chip label="Both" selected={effectiveService === "combined"} onPress={() => setServiceType("combined")} />
              </View>
            </>
          ) : null}

          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Service request type</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {REQUEST_TYPES.map((t) => {
              const sel = requestType === t.value;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => setRequestType(t.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  style={{
                    flex: 1,
                    padding: 10,
                    gap: 4,
                    borderRadius: radius.sm,
                    backgroundColor: sel ? colors.accentSoft : colors.surface,
                    borderWidth: 1,
                    borderColor: sel ? theme.accent : colors.border,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 12, textAlign: "center" }}>{t.label}</Text>
                  <Text style={{ color: theme.accent, fontFamily: fonts.body, fontSize: 10, textAlign: "center" }}>{t.hint}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextField
            label={`Note to ${first} (optional)`}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
            placeholder="Your goals, schedule and anything they should know"
          />

          <Button
            label="Request Guidance"
            onPress={() => submit.mutate()}
            loading={submit.isPending}
            disabled={effectiveService == null}
          />

          <SummaryCard title="How it works">
            <BodyText>1. Request guidance from {name}. No payment is taken when you send a request.</BodyText>
            <BodyText>2. {first} reviews your request and confirms whether they can accept it.</BodyText>
            <BodyText>3. If accepted, {first} provides a scope and quote for your review and acceptance.</BodyText>
            <BodyText muted>
              Accepting a quote does not charge you. Payment is a separate step after you confirm the agreed scope and fee.
            </BodyText>
            <BodyText muted>
              Professional guidance is limited to the agreed service scope. {BRAND_NAME} fitness and wellness services are not a substitute for medical
              diagnosis or treatment.
            </BodyText>
          </SummaryCard>
        </>
      )}
    </ScreenContainer>
  );
}
