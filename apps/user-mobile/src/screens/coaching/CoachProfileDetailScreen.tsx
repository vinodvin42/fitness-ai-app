import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SPOKEN_LANGUAGES } from "@fitness-ai-app/types";
import type { CoachCertification, CoachOpenDay, CoachServiceOffering, ProfessionalServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { ProfessionalAvatar } from "../../components/ProfessionalAvatar";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { LearnMoreLink } from "../../components/LearnMoreSheet";
import { useToast } from "../../components/Toast";
import { fetchCoachProfile, fetchRelationshipStatus } from "../../api/coaching";
import { colors, fonts, radius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { formatRupees } from "../../lib/money";
import { preferredDayForBooking } from "../../lib/coachRequest";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "CoachProfileDetail">;

function roleLine(services: ProfessionalServiceType[]): string {
  if (services.includes("fitness") && services.includes("nutrition")) return "Fitness & Nutrition Professional";
  return services.includes("nutrition") ? "Nutrition Professional" : "Fitness Professional";
}

function offeringName(o: CoachServiceOffering): string {
  if (o.label) return o.label;
  return o.serviceType === "fitness" ? "Fitness session" : o.serviceType === "nutrition" ? "Nutrition session" : "Fitness + nutrition session";
}

const SERVICE_LABEL: Record<ProfessionalServiceType, string> = { fitness: "Fitness", nutrition: "Nutrition" };
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const monthYear = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });

/**
 * Professional profile (Figma professional/11, coach/02; redesigned 25 Oct 2026, then again the same
 * evening for the owner: "make professionals profiles good looking and give them id, name, profile
 * picture, available slots, active status, their experience and certifications").
 *
 * Header: photo (or initials), name, role, Active and whether they're below their client limit, and
 * their FynroX ID to quote. Then experience / clients / past sessions, About (with the languages they
 * coach in, set in the coach app), verified certifications
 * (name, issuer, year; never the documents), the next 7 days of open times, Services with the fee FynroX
 * set for their level, and the one action that fits where the member is with this professional:
 * no relationship yet "Request guidance" (asks first, nothing charged); request waiting "Request
 * pending · View"; accepted "Continue to payment"; active "Book session"; anything else "View status".
 * City and ratings aren't in the API (session ratings are private to the coach), so they aren't shown.
 */
export function CoachProfileDetailScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { colors: theme } = useTheme();
  const toast = useToast();
  const { professionalId } = route.params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "professional", professionalId],
    queryFn: () => fetchCoachProfile(professionalId),
  });
  // Where this member stands with this coach. If the status can't be read the
  // request button still works: asking again is safe (the API repeats it harmlessly).
  const status = useQuery({ queryKey: ["coaching", "relationships", "status"], queryFn: fetchRelationshipStatus });
  const mine = (status.data?.relationships ?? []).filter(
    (r) => r.professionalId === professionalId && !["declined", "expired", "completed", "ended"].includes(r.status),
  );
  // The furthest along wins (a coach can be active for one service and only requested for another).
  const FURTHEST_FIRST = ["active", "accepted", "awaiting_payment", "activating", "requested"];
  const place = (s: string) => (FURTHEST_FIRST.includes(s) ? FURTHEST_FIRST.indexOf(s) : FURTHEST_FIRST.length);
  const current = [...mine].sort((a, b) => place(a.status) - place(b.status))[0] ?? null;
  const back = () => navigation.goBack();

  if (isLoading) {
    return (
      <ScreenContainer title={t("coaching.profile.title")} onBack={back}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer title={t("coaching.profile.title")} onBack={back}>
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  const nutritionOnly = data.verifiedServices.length === 1 && data.verifiedServices[0] === "nutrition";
  const verified = data.certifications.length > 0;
  const copyId = async () => {
    await Clipboard.setStringAsync(data.publicId);
    toast.show("ID copied", "success");
  };

  return (
    <ScreenContainer title={t("coaching.profile.title")} onBack={back}>
      {/* Header: photo, name, role, status and ID */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
        <View style={{ height: 76, backgroundColor: theme.accentSoft }} />
        <View style={{ alignItems: "center", marginTop: -56, paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: 6 }}>
          <View style={{ padding: 4, borderRadius: radius.pill, backgroundColor: colors.surface }}>
            <ProfessionalAvatar professionalId={data.id} name={data.fullName} photoVersion={data.photoVersion} size={104} />
            <View
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={{ position: "absolute", right: 8, bottom: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.success, borderWidth: 3, borderColor: colors.surface }}
            />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs }}>
            <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22, textAlign: "center" }}>
              {data.fullName}
            </Text>
            {verified ? (
              <View accessible accessibilityLabel="Certifications checked by FynroX">
                <Icon name="shield-check" size={20} color={theme.accentText} />
              </View>
            ) : null}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{roleLine(data.verifiedServices)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 4 }}>
            <Pill label="Active" color={colors.successText} background={colors.successSoft} dot={colors.success} />
            {data.acceptingNewClients ? (
              <Pill label="Taking new clients" color={theme.accentText} background={theme.accentSoft} />
            ) : (
              <Pill label="Client list full" color={colors.warningText} background={colors.warningSoft} />
            )}
          </View>
          <Pressable
            onPress={() => void copyId()}
            accessibilityRole="button"
            accessibilityLabel={`FynroX ID ${data.publicId}. Copy`}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: fonts.bodySemi, letterSpacing: 0.6 }}>ID</Text>
            <Text selectable style={{ color: colors.textPrimary, fontSize: 12, fontFamily: fonts.bodySemi, letterSpacing: 0.8 }}>
              {data.publicId}
            </Text>
            <Text style={{ color: theme.accentText, fontSize: 11, fontFamily: fonts.bodySemi }}>Copy</Text>
          </Pressable>
        </View>
      </View>

      {/* Experience at a glance: one card, three columns (labels in sentence case so they never break mid-word) */}
      <View style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md }}>
        <Stat icon="trophy" value={data.yearsExperience != null ? String(data.yearsExperience) : "—"} unit={data.yearsExperience != null ? "yrs" : undefined} label={t("coaching.profile.yearsExp")} />
        <View style={{ width: 1, backgroundColor: colors.border }} />
        <Stat icon="users" value={String(data.totalClients)} label={t("coaching.profile.clients")} />
        <View style={{ width: 1, backgroundColor: colors.border }} />
        <Stat icon="calendar" value={String(data.pastSessions)} label="Sessions held" />
      </View>

      {/* About */}
      <Section>
        <SectionTitle>About</SectionTitle>
        {data.bio ? <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>{data.bio}</Text> : null}
        {data.specializationTags.length > 0 || data.level ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {data.specializationTags.map((tag) => (
              <Pill key={tag} label={tag} color={theme.accentText} background={theme.accentSoft} />
            ))}
            {data.level ? (
              <Pill label={/level/i.test(data.level.name) ? data.level.name : `${data.level.name} level`} color={colors.textSecondary} background={colors.surfaceHigh} />
            ) : null}
          </View>
        ) : null}
        {data.languages.length > 0 ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="globe" size={14} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>Speaks</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {SPOKEN_LANGUAGES.filter((l) => data.languages.includes(l.code)).map((l) => (
                <Pill key={l.code} label={l.native === l.english ? l.english : `${l.english} · ${l.native}`} color={colors.textPrimary} background={colors.surfaceRaised} />
              ))}
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="clock" size={14} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{`On FynroX since ${monthYear(data.joinedAt)}`}</Text>
        </View>
      </Section>

      {/* Certifications */}
      <Section>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <SectionTitle>Certifications</SectionTitle>
          {verified ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>Checked by FynroX</Text> : null}
        </View>
        {verified ? (
          data.certifications.map((c, i) => <CertificationRow key={`${c.serviceType}-${i}`} cert={c} />)
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>No checked certifications to show yet.</Text>
        )}
      </Section>

      {/* Open times */}
      <OpenTimes days={data.openTimes} firstName={data.fullName.split(" ")[0]} />

      {/* Services */}
      <Section>
        <SectionTitle>{t("coaching.profile.services")}</SectionTitle>
        {data.offerings.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t("coaching.profile.noServices")}</Text>
        ) : (
          data.offerings.map((o) => (
            <View key={o.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: spacing.md }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{offeringName(o)}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{`${o.durationMinutes} min session`}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text style={{ color: theme.accentText, fontFamily: fonts.displayBold, fontSize: 16 }}>{o.priceCents === 0 ? "Free" : formatRupees(o.priceCents)}</Text>
                {o.priceCents === 0 ? null : <Text style={{ color: colors.textMuted, fontSize: 11 }}>+ GST</Text>}
              </View>
            </View>
          ))
        )}
        {data.offerings.length > 0 ? <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16 }}>Fees are set by FynroX for this professional's level.</Text> : null}
      </Section>

      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
        <Icon name="info" size={16} color={colors.textMuted} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
            {nutritionOnly
              ? "Nutrition guidance, not medical treatment. Nothing is charged until they accept and you pay."
              : "Nothing is charged until they accept and you pay."}
          </Text>
          <View style={{ alignSelf: "flex-start" }}>
            <LearnMoreLink topic="coach_requests" />
          </View>
        </View>
      </View>

      {current === null && data.offerings.length === 0 ? (
        // 26 Oct 2026 (owner: "unable to request guidance"): with no session priced for this professional's
        // level there is nothing to request, so say why and offer matching instead of a dead grey button.
        // Fixed in admin: Commerce > Coach levels & fees (place the coach in a level that has a fee).
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {`${data.fullName.split(" ")[0]} isn't taking requests yet: FynroX hasn't set a session fee for them. Ask us to match you with a professional who is available now.`}
          </Text>
          <Button label="Ask us to match you" onPress={() => navigation.navigate("RequestGuidance")} />
        </View>
      ) : current === null ? (
        <Button
          label={t("coaching.profile.requestGuidance")}
          onPress={() => navigation.navigate("RequestCoach", { professionalId })}
          disabled={status.isLoading}
        />
      ) : current.status === "active" ? (
        <Button
          label={t("coaching.team.bookSession")}
          onPress={() => navigation.navigate("BookingServiceSelection", { professionalId })}
          disabled={data.offerings.length === 0}
        />
      ) : current.status === "accepted" || current.status === "awaiting_payment" ? (
        <Button
          label={t("coaching.relationship.continueToPayment")}
          onPress={() =>
            navigation.navigate("BookingServiceSelection", {
              professionalId,
              offeringId: current.offeringId ?? undefined,
              preferredDate: preferredDayForBooking(current.preferredDate) ?? undefined,
            })
          }
        />
      ) : (
        <Button
          label={current.status === "requested" ? t("coaching.profile.requestPending") : t("coaching.profile.viewStatus")}
          onPress={() =>
            current.status === "requested" || current.status === "activation_failed" || current.stuck
              ? navigation.navigate("RequestStatus", { relationshipId: current.relationshipId })
              : navigation.navigate("ProfessionalRelationship")
          }
        />
      )}
      <Button
        label="Compare professionals"
        variant="secondary"
        onPress={() => navigation.navigate("CoachDiscovery", { serviceType: data.verifiedServices.length === 1 ? data.verifiedServices[0] : undefined })}
      />
    </ScreenContainer>
  );
}

/** One verified certification: what, who issued it and when, and which service it covers. */
function CertificationRow({ cert }: { cert: CoachCertification }) {
  const { colors: theme } = useTheme();
  const name = cert.name ?? `${SERVICE_LABEL[cert.serviceType]} certification`;
  const meta = [cert.issuedBy, cert.year != null ? String(cert.year) : null].filter(Boolean).join(" · ");
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start", backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: spacing.md }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name="shield-check" size={18} color={theme.accentText} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{name}</Text>
        {meta ? <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{meta}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 2 }}>
          <Pill label={SERVICE_LABEL[cert.serviceType]} color={colors.textSecondary} background={colors.surfaceHigh} small />
          {cert.validUntil ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{`Valid until ${monthYear(cert.validUntil)}`}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/**
 * The next 7 days of free times on the professional's booking grid, in the member's own time zone. Pick
 * a day to see its times. You choose the exact time when you book, after they've accepted.
 */
function OpenTimes({ days, firstName }: { days: CoachOpenDay[]; firstName: string }) {
  const { colors: theme } = useTheme();
  const firstOpen = useMemo(() => days.find((d) => d.times.length > 0)?.date ?? days[0]?.date ?? null, [days]);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = days.find((d) => d.date === (picked ?? firstOpen)) ?? null;
  const total = days.reduce((n, d) => n + d.times.length, 0);

  return (
    <Section>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle>Open times this week</SectionTitle>
        <Text style={{ color: total > 0 ? colors.successText : colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12 }}>{total > 0 ? `${total} free` : "Fully booked"}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {days.map((d) => {
          const on = d.date === selected?.date;
          // Label from the day's first grid time so the weekday is the member's own; noon UTC for a full day.
          const anchor = new Date(d.times[0] ?? `${d.date}T12:00:00Z`);
          return (
            <Pressable
              key={d.date}
              onPress={() => setPicked(d.date)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${anchor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}, ${d.times.length > 0 ? `${d.times.length} free` : "full"}`}
              style={{
                width: 58,
                paddingVertical: 8,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: on ? theme.accent : colors.border,
                backgroundColor: on ? theme.accent : colors.surface,
                alignItems: "center",
                gap: 1,
                opacity: d.times.length > 0 || on ? 1 : 0.55,
              }}
            >
              <Text style={{ color: on ? theme.textOnAccent : colors.textSecondary, fontSize: 11 }}>{anchor.toLocaleDateString(undefined, { weekday: "short" })}</Text>
              <Text style={{ color: on ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 17 }}>{anchor.getDate()}</Text>
              <Text style={{ color: on ? theme.textOnAccent : d.times.length > 0 ? colors.successText : colors.textMuted, fontSize: 10, fontFamily: fonts.bodySemi }}>
                {d.times.length > 0 ? `${d.times.length} free` : "Full"}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {selected && selected.times.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {selected.times.map((iso) => (
            <View key={iso} style={{ minWidth: 76, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{timeLabel(iso)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{`No free times left that day. Try another day.`}</Text>
      )}
      <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16 }}>
        {`Times are in your time zone. You pick one when you book a session with ${firstName}.`}
      </Text>
    </Section>
  );
}

/** One column of the experience card: icon, value (with an optional unit) and a one-line label. */
function Stat({ icon, value, unit, label }: { icon: "trophy" | "users" | "calendar"; value: string; unit?: string; label: string }) {
  const { colors: theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 4, paddingHorizontal: spacing.xs }} accessible accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ""}`}>
      <Icon name={icon} size={18} color={theme.accentText} />
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22 }}>
        {value}
        {unit ? <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{` ${unit}`}</Text> : null}
      </Text>
      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function Pill({ label, color, background, dot, small }: { label: string; color: string; background: string; dot?: string; small?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, backgroundColor: background, paddingHorizontal: small ? 8 : 10, paddingVertical: small ? 2 : 4 }}>
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text style={{ color, fontFamily: fonts.bodySemi, fontSize: small ? 11 : 12 }}>{label}</Text>
    </View>
  );
}

function Section({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 12 }, style]}>
      {children}
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 16 }}>{children}</Text>;
}
