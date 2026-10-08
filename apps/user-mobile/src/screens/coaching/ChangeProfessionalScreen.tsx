import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ChangeReasonCategory } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { SelectCard } from "../../components/SelectCard";
import { Button } from "../../components/Button";
import { submitChangeRequest } from "../../api/coaching";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "ChangeProfessional">;

const REASONS: Array<{ value: ChangeReasonCategory; label: string }> = [
  { value: "schedule_conflict", label: "Schedule conflicts" },
  { value: "different_specialization", label: "Different specialization" },
  { value: "other", label: "Other personal preferences" },
];

/**
 * Change Professional (docs/coach/03-screen-inventory.md §E) — this is
 * the user-facing counterpart to the admin console's Change/Intervention
 * Queue (04.03, not built — see schema.prisma's RelationshipChangeStatus
 * comment). Submitting creates a real, persisted RelationshipChangeRequest
 * and — per the design's own warning banner — deliberately does NOT end
 * the relationship itself; that stays a reviewed action for a future
 * admin screen. "Find New [Service] Coach" routes back into Discovery,
 * pre-filtered to this relationship's service type.
 */
export function ChangeProfessionalScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { relationshipId, professionalFullName, serviceType } = route.params;

  const [reason, setReason] = useState<ChangeReasonCategory | null>(null);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!reason) return;
    setIsSubmitting(true);
    try {
      await submitChangeRequest(relationshipId, { reason, note: note.trim() || undefined });
      // No field on Relationship actually changes here (submitting a
      // change request deliberately doesn't end it — see this screen's
      // own doc comment) — nothing to invalidate before navigating on.
      navigation.navigate("CoachDiscovery", { serviceType });
    } catch (err) {
      Alert.alert("Couldn't submit request", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer title={t("coaching.change.title")}>
      <Card>
        <Text style={{ color: colors.warning, ...typography.h2 }}>{t("coaching.change.headsUp")}</Text>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
          Changing your {serviceType} professional doesn't affect any other service relationship you have — only
          your pairing with {professionalFullName} for {serviceType}.
        </Text>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textSecondary }}>{t("coaching.change.current")}</Text>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: spacing.xs }}>
          {professionalFullName}
        </Text>
      </Card>

      <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>
        {t("coaching.change.why")}
      </Text>
      <View style={{ gap: spacing.xs }}>
        {REASONS.map((r) => (
          <SelectCard key={r.value} title={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />
        ))}
      </View>

      {reason === "other" ? (
        <TextInput
          style={{
            height: 80,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceRaised,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.sm,
            color: colors.textPrimary,
            marginTop: spacing.sm,
            textAlignVertical: "top",
          }}
          placeholder={t("coaching.change.tellUsMore")}
          placeholderTextColor={colors.textMuted}
          value={note}
          onChangeText={setNote}
          multiline
        />
      ) : null}

      <Button
        label={`Find New ${serviceType === "fitness" ? "Fitness" : "Nutrition"} Coach`}
        onPress={onSubmit}
        loading={isSubmitting}
        disabled={!reason}
        style={{ marginTop: spacing.lg }}
      />
    </ScreenContainer>
  );
}
