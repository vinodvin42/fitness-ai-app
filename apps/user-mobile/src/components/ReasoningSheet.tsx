import React from "react";
import { Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { InfoCard } from "./StatePanels";
import { colors, radius, spacing, typography } from "../theme/tokens";

export interface ReasoningRow {
  label: string;
  value: string;
}

interface ReasoningSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The AI-written rationale string. */
  rationale: string;
  /** Card heading above the rationale. */
  heading?: string;
  /** Real facts the suggestion was based on (label/value pairs). */
  rows?: ReasoningRow[];
  /** ISO timestamp the recommendation was generated, when known. */
  generatedAt?: string | null;
  /** Caveat line, e.g. that estimates can be wrong. */
  caveat?: string;
  action?: { label: string; onPress: () => void };
  title?: string;
  /** Short lead-in line above the cards (Figma AI 04). */
  intro?: string;
  /** Muted helper line under the action button. */
  footnote?: string;
  /** Show the "x" close icon instead of the "Close" text. */
  closeIcon?: boolean;
}

/** Reusable "Why this?" sheet for any AI recommendation that carries a rationale (Figma AI 04). */
export function ReasoningSheet({
  visible,
  onClose,
  rationale,
  heading = "A suggestion, not a prescription",
  rows,
  generatedAt,
  caveat = "AI guidance can be wrong — check it against your own logs and judgement. General wellness advice only, not medical advice.",
  action,
  title = "Why this?",
  intro,
  footnote,
  closeIcon,
}: ReasoningSheetProps) {
  const generated = generatedAt ? new Date(generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  const allRows = [...(rows ?? []), ...(generated ? [{ label: "Generated", value: generated }] : [])];
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} closeIcon={closeIcon}>
      {intro ? <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>{intro}</Text> : null}
      <InfoCard tone="ai" title={heading} body={rationale} />
      {allRows.length > 0 ? (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 10 }}>
          {allRows.map((r) => (
            <View key={r.label} style={{ flexDirection: "row", gap: 12 }}>
              <Text style={{ width: 104, color: colors.textSecondary, ...typography.meta }}>{r.label}</Text>
              <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>{caveat}</Text>
      {action ? (
        <Button
          label={action.label}
          onPress={() => {
            onClose();
            action.onPress();
          }}
        />
      ) : null}
      {footnote ? <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>{footnote}</Text> : null}
    </BottomSheet>
  );
}
