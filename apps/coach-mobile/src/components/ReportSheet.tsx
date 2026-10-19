import React, { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import type { SafetyReportReason } from "@fitness-ai-app/types";
import { Button } from "./Button";
import { colors, radius, spacing, typography } from "../theme/tokens";

const REASONS: { key: SafetyReportReason; label: string }[] = [
  { key: "harassment", label: "Harassment or bullying" },
  { key: "sexual_content", label: "Sexual or inappropriate content" },
  { key: "threats_or_hate", label: "Threats or hate" },
  { key: "spam_or_scam", label: "Spam or scam" },
  { key: "impersonation", label: "Pretending to be someone else" },
  { key: "other", label: "Something else" },
];

type Props = {
  visible: boolean;
  /** The client's first name or "this message", for the heading. */
  subject: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (reason: SafetyReportReason, details: string) => void;
};

/**
 * Report sheet for client chat (Oct 2026; app-store rules require a way to
 * report offensive content). Same reasons as the client app, minus "unsafe
 * health advice", which is about coaches. The report goes to Fynrox's safety
 * team (admin 08.04); the client isn't told who reported them.
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "700" }}>
              Report {subject}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
              <Text style={{ color: colors.textSecondary, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>
            Fynrox's safety team will review it. They won't tell the client who reported them.
          </Text>
          {REASONS.map((r) => {
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
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: selected ? colors.accent : colors.border,
                  backgroundColor: selected ? colors.surfaceRaised : colors.surface,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: selected ? "600" : "400", fontSize: 15 }}>{r.label}</Text>
              </Pressable>
            );
          })}
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
              backgroundColor: colors.background,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.sm,
              textAlignVertical: "top",
            }}
          />
          <Button label="Send report" onPress={() => reason && onSubmit(reason, details.trim())} loading={submitting} disabled={!reason || submitting} />
        </View>
      </View>
    </Modal>
  );
}
