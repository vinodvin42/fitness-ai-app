import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { Exercise } from "@fitness-ai-app/types";
import { BottomSheet } from "./BottomSheet";
import { Icon } from "./Icon";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";

const MAX_RESULTS = 40;

/**
 * "+ Add exercise" (Figma 03b log/01, Batch 3b): search the published
 * exercise library and add one to this workout only. Exercises already in the
 * workout are left out (the API refuses duplicates too).
 */
export function AddExerciseSheet({
  visible,
  exercises,
  loading,
  excludeIds,
  onPick,
  onClose,
}: {
  visible: boolean;
  exercises: Exercise[] | undefined;
  loading: boolean;
  excludeIds: readonly string[];
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (exercises ?? [])
      .filter((e) => !excludeIds.includes(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q) || e.equipment.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [exercises, excludeIds, query]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add exercise">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Bench press, back, dumbbell"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Search exercises"
        autoCorrect={false}
        style={{
          height: 44,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceRaised,
          paddingHorizontal: spacing.md,
          color: colors.textPrimary,
          fontSize: 15,
        }}
      />
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : results.length === 0 ? (
        <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>No matching exercises.</Text>
      ) : (
        <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          {results.map((e, i) => (
            <Pressable
              key={e.id}
              onPress={() => onPick(e.id)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${e.name}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                paddingHorizontal: spacing.md,
                paddingVertical: 12,
                backgroundColor: colors.surfaceRaised,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{e.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {e.muscleGroup} · {e.equipment}
                </Text>
              </View>
              <Icon name="plus" size={18} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}
    </BottomSheet>
  );
}
