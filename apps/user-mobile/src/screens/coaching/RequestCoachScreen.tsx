import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { SelectCard } from "../../components/SelectCard";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { useToast } from "../../components/Toast";
import { fetchCoachProfile, requestGuidanceFromCoach } from "../../api/coaching";
import { extractErrorMessage } from "../../lib/apiError";
import { PREFERRED_DAYS_AHEAD, REQUEST_REPLY_HOURS, upcomingDays } from "../../lib/coachRequest";
import { formatRupees } from "../../lib/money";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "RequestCoach">;

const NOTE_MAX = 300;

function serviceLabel(serviceType: string | null) {
  if (serviceType === "fitness") return "Fitness Coaching";
  if (serviceType === "nutrition") return "Nutrition Session";
  return "Combined Session";
}

/**
 * Request guidance (Figma coach/02, 25 Oct 2026): ask a coach for help before
 * anything is paid. The member says which service they want, which day they'd
 * like to start (optional) and anything the coach should know (optional); the
 * coach has REQUEST_REPLY_HOURS to answer. Nothing is charged here: if the
 * coach accepts, the member is taken on to pick a time and pay (the hub's
 * "Continue to payment"), with this service and day already chosen. Before this
 * screen the request was created as a side effect of a payment attempt that
 * the API refused.
 */
export function RequestCoachScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
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

  // A coach with one service needs no choosing.
  useEffect(() => {
    if (!offeringId && data?.offerings.length === 1) setOfferingId(data.offerings[0].id);
  }, [data, offeringId]);

  if (isLoading) {
    return (
      <ScreenContainer title={t("coaching.request.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }
  if (isError || !data) {
    return (
      <ScreenContainer title={t("coaching.request.title")}>
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  const offering = data.offerings.find((o) => o.id === offeringId) ?? null;
  const firstName = data.fullName.split(" ")[0];

  const send = async () => {
    if (!offering) return;
    // A combined session covers every service the coach is verified for; each needs its own request.
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

  return (
    <ScreenContainer title={t("coaching.request.title")} subtitle={t("coaching.request.subtitle", { name: data.fullName })}>
      <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>{t("coaching.request.chooseService")}</Text>
      <View style={{ gap: spacing.xs }}>
        {data.offerings.map((o) => (
          <SelectCard
            key={o.id}
            title={`${o.label ?? serviceLabel(o.serviceType)} · ${o.durationMinutes}min`}
            subtitle={
              o.priceCents === 0
                ? t("coaching.request.free")
                : t("coaching.request.fee", { fee: formatRupees(o.priceCents), gst: formatRupees(o.gstCents), total: formatRupees(o.totalCents) })
            }
            selected={offeringId === o.id}
            onPress={() => setOfferingId(o.id)}
          />
        ))}
      </View>

      <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>{t("coaching.request.chooseDay")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <Chip label={t("coaching.request.anyDay")} selected={dateKey === null} onPress={() => setDateKey(null)} />
          {days.map((d, i) => (
            <Chip
              key={d.key}
              label={i === 0 ? t("coaching.request.today") : d.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              selected={dateKey === d.key}
              onPress={() => setDateKey(d.key)}
            />
          ))}
        </View>
      </ScrollView>

      <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>{t("coaching.request.noteLabel")}</Text>
      <TextInput
        value={note}
        onChangeText={(v) => setNote(v.slice(0, NOTE_MAX))}
        placeholder={t("coaching.request.notePlaceholder")}
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={NOTE_MAX}
        accessibilityLabel={t("coaching.request.noteLabel")}
        style={{
          minHeight: 88,
          textAlignVertical: "top",
          color: colors.textPrimary,
          backgroundColor: colors.surfaceRaised,
          borderRadius: radius.md,
          padding: spacing.sm,
        }}
      />
      <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 4 }}>
        {t("coaching.request.noteHint", { count: note.length, max: NOTE_MAX })}
      </Text>

      <Card style={{ marginTop: spacing.md, gap: spacing.xs }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t("coaching.request.howTitle")}</Text>
        <Text style={{ color: colors.textSecondary }}>{t("coaching.request.how1")}</Text>
        <Text style={{ color: colors.textSecondary }}>{t("coaching.request.how2", { name: firstName, hours: REQUEST_REPLY_HOURS })}</Text>
        <Text style={{ color: colors.textSecondary }}>{t("coaching.request.how3")}</Text>
      </Card>

      <Button
        label={t("coaching.request.send")}
        onPress={send}
        loading={sending}
        disabled={!offering || sending}
        style={{ marginTop: spacing.lg }}
      />
    </ScreenContainer>
  );
}
