import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { LEARN_MORE, type LearnMoreTopic } from "../lib/learnMore";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/** Figma pattern/learn-more-sheet (24 Oct 2026): the explanation for one topic (lib/learnMore.ts). */
export function LearnMoreSheet({ topic, onClose }: { topic: LearnMoreTopic | null; onClose: () => void }) {
  const c = topic ? LEARN_MORE[topic] : null;
  return (
    <BottomSheet visible={!!c} onClose={onClose} title={c?.title ?? ""} closeIcon gap={14} paddingX={20}>
      {c ? (
        <>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14, lineHeight: 20, marginTop: -6 }}>{c.description}</Text>
          <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
            {c.facts.map((f, i) => (
              <View
                key={f.label}
                style={{
                  flexDirection: "row",
                  gap: spacing.md,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text style={{ width: 120, color: colors.textSecondary, fontSize: 13 }}>{f.label}</Text>
                <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18 }}>{f.value}</Text>
              </View>
            ))}
          </View>
          {c.calculation ? (
            <View style={{ gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceRaised }}>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.6 }}>{c.calculation.label.toUpperCase()}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>{c.calculation.text}</Text>
            </View>
          ) : null}
          {c.note ? <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 18, marginBottom: spacing.sm }}>{c.note}</Text> : null}
        </>
      ) : null}
    </BottomSheet>
  );
}

/** A "Learn more" link that opens the sheet for `topic`. */
export function LearnMoreLink({ topic, label = "Learn more" }: { topic: LearnMoreTopic; label?: string }) {
  const { colors: theme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${LEARN_MORE[topic].title}`} hitSlop={8}>
        <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>{label}</Text>
      </Pressable>
      <LearnMoreSheet topic={open ? topic : null} onClose={() => setOpen(false)} />
    </>
  );
}
