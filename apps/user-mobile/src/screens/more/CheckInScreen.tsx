import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { fetchCheckInStatus, fetchCheckIns, submitCheckIn } from "../../api/progress";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";
import type { CheckIn, CheckInPeriod } from "@fitness-ai-app/types";

type Props = NativeStackScreenProps<ProgressStackParamList, "CheckIn">;

const RATING_SCALE = [1, 2, 3, 4, 5];

/**
 * Check-In (R1 Developer 1 U5, 15 Sep 2026) — the required "Daily /
 * weekly Check-In" screen (work package §4), which had zero backing
 * anywhere in this codebase before this pass (confirmed via a repo-wide
 * grep for check-in/checkin/Check-In).
 *
 * **Real scope decision made, not left implicit:** this is a real,
 * self-contained, honestly-persisted signal — energy/soreness/adherence
 * (1-5 each, tappable Chips, same "no slider control exists anywhere in
 * this app" precedent as SetRestTrackerScreen's RPE scale — gap §24) plus
 * an optional note — NOT wired into the Plan/Recommendation engine's AI
 * reasoning (`apps/api/src/modules/plans/plans.service.ts`), which is a
 * parallel, separately-owned U5 workstream (Progress/"Why This
 * Changed"/Recommendation states) this pass deliberately stays out of to
 * avoid a real conflict rather than a clean shared extension point. This
 * screen also deliberately does NOT compute or display a "context
 * confidence" score (work package §5's Core State Requirements table) —
 * nothing in this codebase names that concept yet, and inventing a
 * scoring formula here would be exactly the kind of fabricated certainty
 * BR-AI-011 ("uncertainty is visible and valid") warns against. What IS
 * honest here: a period's own completion state is read plainly off a real
 * row (`GET /check-ins/status`) and never guessed — a period with no
 * submission just shows the form, not a fake "insufficient context" label
 * standing in for a concept this pass doesn't own.
 *
 * At most one Check-In per user per real calendar period (today, or the
 * current ISO week) — enforced server-side by a genuine DB unique
 * constraint (see progress.service.ts's submitCheckIn() doc comment), so
 * an already-submitted period renders its own real entry instead of the
 * form, rather than trusting client-side state alone.
 */
export function CheckInScreen({ navigation: _navigation }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<CheckInPeriod>("daily");
  const [energy, setEnergy] = useState<number | undefined>();
  const [soreness, setSoreness] = useState<number | undefined>();
  const [adherence, setAdherence] = useState<number | undefined>();
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const statusQuery = useQuery({ queryKey: ["checkIns", "status"], queryFn: fetchCheckInStatus });
  const historyQuery = useQuery({ queryKey: ["checkIns", "list"], queryFn: fetchCheckIns });

  const isLoading = statusQuery.isLoading || historyQuery.isLoading;
  const isError = statusQuery.isError || historyQuery.isError;

  const refetchAll = () => {
    statusQuery.refetch();
    historyQuery.refetch();
  };

  if (isError) {
    return (
      <ScreenContainer title={t("checkIn.title")}>
        <ErrorState onRetry={refetchAll} />
      </ScreenContainer>
    );
  }

  if (isLoading || !statusQuery.data) {
    return (
      <ScreenContainer title={t("checkIn.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const periodStatus = period === "daily" ? statusQuery.data.daily : statusQuery.data.weekly;
  const canSubmit = energy !== undefined && soreness !== undefined && adherence !== undefined;

  const onSelectPeriod = (next: CheckInPeriod) => {
    setPeriod(next);
    setEnergy(undefined);
    setSoreness(undefined);
    setAdherence(undefined);
    setNote("");
  };

  const onSubmit = async () => {
    if (!canSubmit || energy === undefined || soreness === undefined || adherence === undefined) return;
    setIsSubmitting(true);
    try {
      await submitCheckIn({
        period,
        energy,
        soreness,
        adherence,
        note: note.trim().length > 0 ? note.trim() : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["checkIns"] });
      setEnergy(undefined);
      setSoreness(undefined);
      setAdherence(undefined);
      setNote("");
    } catch (err) {
      Alert.alert("Couldn't save check-in", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer title={t("checkIn.title")} subtitle={t("checkIn.subtitle")}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Chip label={t("checkIn.daily")} selected={period === "daily"} onPress={() => onSelectPeriod("daily")} />
        <Chip label={t("checkIn.weekly")} selected={period === "weekly"} onPress={() => onSelectPeriod("weekly")} />
      </View>

      {periodStatus.submitted && periodStatus.checkIn ? (
        <Card style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
            <Icon name="check" size={18} color={colors.success} />
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>
              {period === "daily" ? "You've checked in today" : "You've checked in this week"}
            </Text>
          </View>
          <RatingSummary checkIn={periodStatus.checkIn} />
          {periodStatus.checkIn.note ? (
            <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>{periodStatus.checkIn.note}</Text>
          ) : null}
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
            {period === "daily" ? "Come back tomorrow for your next check-in." : "Come back next week for your next check-in."}
          </Text>
        </Card>
      ) : (
        <Card style={{ marginTop: spacing.md }}>
          <RatingPicker label={t("checkIn.energy")} value={energy} onChange={setEnergy} />
          <RatingPicker label={t("checkIn.soreness")} value={soreness} onChange={setSoreness} />
          <RatingPicker label={t("checkIn.adherence")} value={adherence} onChange={setAdherence} />

          <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>
            {t("checkIn.note")}
          </Text>
          <TextInput
            style={{
              minHeight: 72,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceRaised,
              padding: spacing.sm,
              color: colors.textPrimary,
              textAlignVertical: "top",
            }}
            placeholder={t("checkIn.notePlaceholder")}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={280}
            value={note}
            onChangeText={setNote}
          />

          <Button
            label={period === "daily" ? t("checkIn.submitDaily") : t("checkIn.submitWeekly")}
            onPress={onSubmit}
            loading={isSubmitting}
            disabled={!canSubmit}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      )}

      {historyQuery.data && historyQuery.data.length > 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("checkIn.recent")}</Text>
          {historyQuery.data.slice(0, 8).map((c) => (
            <Card key={c.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.textPrimary, ...typography.label }}>
                  {c.period === "daily" ? "Daily" : "Weekly"} · {new Date(c.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <RatingSummary checkIn={c} compact />
            </Card>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function RatingPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        {RATING_SCALE.map((n) => (
          <Chip
            key={n}
            label={String(n)}
            accessibilityLabel={`${label}: ${n} of 5`}
            selected={value === n}
            onPress={() => onChange(n)}
          />
        ))}
      </View>
    </View>
  );
}

function RatingSummary({ checkIn, compact }: { checkIn: CheckIn; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: compact ? spacing.xs : 0 }}>
      <RatingValue label={t("checkIn.energy")} value={checkIn.energy} />
      <RatingValue label={t("checkIn.soreness")} value={checkIn.soreness} />
      <RatingValue label={t("checkIn.adherence")} value={checkIn.adherence} />
    </View>
  );
}

function RatingValue({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{value}/5</Text>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
    </View>
  );
}
