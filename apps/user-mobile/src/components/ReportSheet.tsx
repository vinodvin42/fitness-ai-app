import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { SafetyReportReason } from "@fitness-ai-app/types";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";

export const REPORT_REASONS: { key: SafetyReportReason; label: string }[] = [
  { key: "harassment", label: "Harassment or bullying" },
  { key: "sexual_content", label: "Sexual or inappropriate content" },
  { key: "threats_or_hate", label: "Threats or hate" },
  { key: "spam_or_scam", label: "Spam or scam" },
  { key: "unsafe_advice", label: "Unsafe health advice" },
  { key: "impersonation", label: "Fake credentials or impersonation" },
  { key: "other", label: "Something else" },
];

type Props = {
  visible: boolean;
  /** "your coach" or "this message" — what's being reported, for the heading. */
  subject: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (reason: SafetyReportReason, details: string) => void;
};

/**
 * Report sheet for coach chat (Oct 2026; app-store rules require a way to
 * report offensive content). Pick a reason, optionally add a note, send.
 * The report goes to Fynrox's safety team (admin 08.04); the other person
 * isn't told who reported them.
 */
export function ReportSheet({ visible, subject, submitting, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState<SafetyReportReason | null>(null);
  const [details, setDetails] = useState("");

  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails("");
    }
  }, [visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`Report ${subject}`}>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          Fynrox's safety team will review it. They won't tell the other person who reported them.
        </Text>
        <View accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
          {REPORT_REASONS.map((r) => {
            const selected = reason === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setReason(r.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{
                  minHeight: 48,
                  justifyContent: "center",
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: selected ? colors.accent : colors.border,
                  backgroundColor: selected ? colors.accentSoft : colors.surface,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontFamily: selected ? fonts.bodySemi : fonts.body, fontSize: 15 }}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder="Anything else we should know? (optional)"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={1000}
          accessibilityLabel="More details, optional"
          style={{
            minHeight: 72,
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: colors.outline,
            padding: spacing.sm,
            textAlignVertical: "top",
          }}
        />
        <Button label="Send report" onPress={() => reason && onSubmit(reason, details.trim())} loading={submitting} disabled={!reason || submitting} />
      </View>
    </BottomSheet>
  );
}
