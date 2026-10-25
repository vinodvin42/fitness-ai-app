import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CoachServiceOffering, ProfessionalServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { LearnMoreLink } from "../../components/LearnMoreSheet";
import { useToast } from "../../components/Toast";
import { fetchCoachProfile, requestGuidanceFromCoach } from "../../api/coaching";
import { extractErrorMessage } from "../../lib/apiError";
import { PREFERRED_DAYS_AHEAD, REQUEST_REPLY_HOURS, upcomingDays } from "../../lib/coachRequest";
import { formatRupees } from "../../lib/money";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "RequestCoach">;

const NOTE_MAX = 300;

function serviceLabel(serviceType: string | null) {
  if (serviceType === "fitness") return "Fitness Coaching";
  if (serviceType === "nutrition") return "Nutrition Session";
  return "Combined Session";
}

function roleLine(services: ProfessionalServiceType[]): string {
  if (services.includes("fitness") && services.includes("nutrition")) return "Fitness & Nutrition Professional";
  return services.includes("nutrition") ? "Nutrition Professional" : "Fitness Professional";
}

/**
 * Request guidance (Figma coach/02; laid out to the frame 25 Oct 2026): ask a professional for help
 * before anything is paid. The professional at the top, a preferred day (optional), the service, an
 * optional note, then "Request guidance" and how it works. Nothing is charged here: the professional
 * has REQUEST_REPLY_HOURS to answer, and if they accept the member picks a time and pays then, with
 * this service and day already chosen. Kept beyond the Figma: "Any day" and the note. Not copied: the
 * guided-program tile and price (not built) and the share button.
 */
export function RequestCoachScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { colors: theme } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { professionalId } = route.params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "professional", professionalId],
    queryFn: () => fetchCoachProfile(professionalId),
  });

  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const days = useMemo(() => upcomingDays(PREFERRED_DAYS_AHEAD), []);

  // A professional with one service needs no choosing.
  useEffect(() => {
    if (!offeringId && data?.offerings.length === 1) setOfferingId(data.offerings[0].id);
  }, [data, offeringId]);

  const back = () => navigation.goBack();

  if (isLoading) {
    return (
      <ScreenContainer title={t("coaching.request.title")} onBack={back}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }
  if (isError || !data) {
    return (
      <ScreenContainer title={t("coaching.request.title")} onBack={back}>
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  const offering = data.offerings.find((o) => o.id === offeringId) ?? null;
  const firstName = data.fullName.split(" ")[0];
  const tags = [...data.specializationTags, ...(data.level ? [data.level.name] : [])];

  const send = async () => {
    if (!offering) return;
    // A combined session covers every service the professional is verified for; each needs its own request.
    const services: ProfessionalServiceType[] = offering.serviceType ? [offering.serviceType] : data.verifiedServices;
    setSending(true);
    try {
      for (const serviceType of services) {
        await requestGuidanceFromCoach({
          professionalId,
          serviceType,
          offeringId: offering.id,
          preferredDate: dateKey ?? undefined,
          note: note.trim() || undefined,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["coaching", "relationships", "status"] });
      toast.show(t("coaching.request.sent", { name: firstName }), "success");
      navigation.replace("ProfessionalRelationship");
    } catch (err) {
      toast.show(extractErrorMessage(err, t("coaching.request.failed")), "error");
    } finally {
      setSending(false);
    }
  };

  const feeOf = (o: CoachServiceOffering) => (o.priceCents === 0 ? t("coaching.request.free") : formatRupees(o.priceCents));

  return (
    <ScreenContainer title={t("coaching.request.title")} onBack={back}>
      {/* The professional */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Avatar name={data.fullName} size={72} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 20 }}>{data.fullName}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{roleLine(data.verifiedServices)}</Text>
        </View>
      </View>
      {tags.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {tags.map((tag) => (
            <View key={tag} style={{ borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t("coaching.request.subtitle", { name: firstName })}</Text>

      {/* Preferred day */}
      <Heading>{t("coaching.request.chooseDay")}</Heading>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        <DayTile top="Any" bottom="day" a11y={t("coaching.request.anyDay")} selected={dateKey === null} onPress={() => setDateKey(null)} />
        {days.map((d, i) => (
          <DayTile
            key={d.key}
            top={d.date.toLocaleDateString(undefined, { weekday: "short" })}
            bottom={String(d.date.getDate()).padStart(2, "0")}
            a11y={i === 0 ? t("coaching.request.today") : d.date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            selected={dateKey === d.key}
            onPress={() => setDateKey(d.key)}
          />
        ))}
      </ScrollView>

      {/* Service */}
      <Heading>{t("coaching.request.chooseService")}</Heading>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {data.offerings.map((o) => {
          const on = offeringId === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => setOfferingId(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${o.label ?? serviceLabel(o.serviceType)}, ${o.durationMinutes} minutes, ${feeOf(o)}`}
              style={{
                flexGrow: 1,
                flexBasis: "30%",
                minHeight: 64,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: on ? theme.accent : colors.border,
                backgroundColor: on ? theme.accentSoft : colors.surface,
                alignItems: "center",
                justifyContent: "center",
                padding: spacing.sm,
                gap: 2,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13, textAlign: "center" }}>{o.label ?? serviceLabel(o.serviceType)}</Text>
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 12 }}>{feeOf(o)}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{o.durationMinutes} min</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
        {`Fees set by FynroX for ${firstName}'s level${data.level ? ` (${data.level.name})` : ""}. `}
        {offering && offering.priceCents > 0
          ? t("coaching.request.fee", { fee: formatRupees(offering.priceCents), gst: formatRupees(offering.gstCents), total: formatRupees(offering.totalCents) })
          : "GST is added on top."}
      </Text>

      {/* Note */}
      <Heading>{t("coaching.request.noteLabel")}</Heading>
      <TextInput
        value={note}
        onChangeText={(v) => setNote(v.slice(0, NOTE_MAX))}
        placeholder={t("coaching.request.notePlaceholder")}
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={NOTE_MAX}
        accessibilityLabel={t("coaching.request.noteLabel")}
        style={{
          minHeight: 80,
          textAlignVertical: "top",
          color: colors.textPrimary,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          padding: spacing.sm + 2,
        }}
      />
      <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: -6 }}>{t("coaching.request.noteHint", { count: note.length, max: NOTE_MAX })}</Text>

      <Button label={t("coaching.request.send")} onPress={() => void send()} loading={sending} disabled={!offering || sending} />

      {/* How it works */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{t("coaching.request.howTitle")}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{t("coaching.request.how1")}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{t("coaching.request.how2", { name: firstName, hours: REQUEST_REPLY_HOURS })}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{t("coaching.request.how3")}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>Guidance only, not medical diagnosis or treatment.</Text>
        <View style={{ alignSelf: "flex-start" }}>
          <LearnMoreLink topic="coach_requests" />
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
          Once you're working together, you choose what they can see in Profile › Data & Privacy.
        </Text>
      </View>
    </ScreenContainer>
  );
}

function Heading({ children }: { children: string }) {
  return <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 16, marginBottom: -4 }}>{children}</Text>;
}

/** A day in the preferred-day strip (Figma coach/02): weekday over date, filled when chosen. */
function DayTile({ top, bottom, a11y, selected, onPress }: { top: string; bottom: string; a11y: string; selected: boolean; onPress: () => void }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={a11y}
      style={{
        width: 48,
        height: 56,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: selected ? theme.accent : colors.border,
        backgroundColor: selected ? theme.accent : colors.surface,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <Text style={{ color: selected ? theme.textOnAccent : colors.textSecondary, fontSize: 12 }}>{top}</Text>
      <Text style={{ color: selected ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 16 }}>{bottom}</Text>
    </Pressable>
  );
}
