import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SupportTicketCategory } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import { createTicket } from "../../api/support";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "SupportTicketForm">;

// docs/mobile/03-screen-inventory.md §L "report-a-bug / feature-request
// actions" — folded into one form with a category chip, rather than two
// separate flows that would only differ by which chip is pre-selected.
// Values only; the labels live in the catalogue under
// `ticket.category.*`, keyed by the same value.
const CATEGORIES: SupportTicketCategory[] = ["bug", "feature_request", "billing", "account", "other"];

/**
 * New Support Ticket (docs/mobile/03-screen-inventory.md §L) — not its
 * own named screen in the design, which folds ticket submission into
 * "Support" itself; split out here as a real form since a category +
 * subject + message submission needs more room than a card on the list
 * screen. Submits to a real `SupportTicket` row — see SupportScreen.tsx's
 * own doc comment for what's still Phase 6-only (status progression,
 * an admin reply thread).
 */
export function SupportTicketFormScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Report Bug / Feature Request on Help & Support open this form with a preset category.
  const [category, setCategory] = useState<SupportTicketCategory>(route.params?.category ?? "other");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await createTicket({ category, subject: subject.trim(), message: message.trim() });
      await queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't submit ticket", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer title={t("ticket.newTitle")}>
      <Card>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {CATEGORIES.map((value) => (
            <Chip
              key={value}
              label={t(`ticket.category.${value}`)}
              selected={category === value}
              onPress={() => setCategory(value)}
            />
          ))}
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>{t("ticket.subject")}</Text>
        <TextInput
          style={styles.input}
          placeholder={t("ticket.subjectPlaceholder")}
          placeholderTextColor={colors.textMuted}
          value={subject}
          onChangeText={setSubject}
          maxLength={140}
        />

        <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>{t("ticket.message")}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder={t("ticket.messagePlaceholder")}
          placeholderTextColor={colors.textMuted}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={4000}
        />
      </Card>

      <Button label={t("ticket.submit")} onPress={onSubmit} loading={isSubmitting} disabled={!canSubmit} style={{ marginTop: spacing.lg }} />
    </ScreenContainer>
  );
}

const styles = {
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  multiline: {
    height: 120,
    paddingTop: spacing.sm,
    textAlignVertical: "top" as const,
  },
} as const;
