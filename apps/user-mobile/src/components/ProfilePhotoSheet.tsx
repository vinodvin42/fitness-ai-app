import React from "react";
import { Pressable, Text, View } from "react-native";
import { ExerciseMenuSheet, type ExerciseMenuItem } from "./ExerciseMenuSheet";
import { Icon, type IconName } from "./Icon";
import type { PhotoSource } from "../lib/profilePhoto";
import { colors, fonts, radius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/**
 * Profile photo actions (20 Oct 2026), opened from the avatar on Profile and
 * View Profile: upload a photo from the gallery, take one, or remove the
 * current one. The camera or gallery opens once the sheet has closed.
 */
export function ProfilePhotoSheet({
  visible,
  hasPhoto,
  onClose,
  onChoose,
  onRemove,
}: {
  visible: boolean;
  hasPhoto: boolean;
  onClose: () => void;
  onChoose: (source: PhotoSource) => void;
  onRemove: () => void;
}) {
  const later = (fn: () => void) => () => setTimeout(fn, 300);
  const items: ExerciseMenuItem[] = [
    { key: "library", label: "Upload photo", icon: "image", onPress: later(() => onChoose("library")) },
    { key: "camera", label: "Take photo", icon: "camera", onPress: later(() => onChoose("camera")) },
    ...(hasPhoto ? [{ key: "remove", label: "Remove photo", icon: "trash" as const, onPress: later(onRemove) }] : []),
  ];
  return (
    <ExerciseMenuSheet
      visible={visible}
      title="Profile photo"
      items={items}
      footnote="Your profile photo is only shown to you in the app."
      onClose={onClose}
    />
  );
}

/**
 * Upload photo / Take photo (owner, 21 Oct 2026: "give option to upload photo
 * and take picture"), shown under the avatar on Profile and View Profile so the
 * choices are visible without tapping the avatar. Remove appears once a photo
 * is set. They open the gallery or camera straight away (no sheet to close).
 */
export function ProfilePhotoButtons({
  hasPhoto,
  busy,
  onChoose,
  onRemove,
}: {
  hasPhoto: boolean;
  busy: boolean;
  onChoose: (source: PhotoSource) => void;
  onRemove: () => void;
}) {
  const { colors: theme } = useTheme();
  const pill = (key: string, label: string, icon: IconName, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: busy ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Icon name={icon} size={15} color={theme.accentText} />
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm }}>
      {pill("library", "Upload photo", "image", () => onChoose("library"))}
      {pill("camera", "Take photo", "camera", () => onChoose("camera"))}
      {hasPhoto ? pill("remove", "Remove", "trash", onRemove) : null}
    </View>
  );
}
