import React from "react";
import { ExerciseMenuSheet, type ExerciseMenuItem } from "./ExerciseMenuSheet";
import type { PhotoSource } from "../lib/profilePhoto";

/**
 * Profile photo actions (20 Oct 2026), opened from the avatar on Profile and
 * View Profile: take a photo, choose one from the gallery, or remove the
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
    { key: "camera", label: "Take photo", icon: "camera", onPress: later(() => onChoose("camera")) },
    { key: "library", label: "Choose from gallery", icon: "image", onPress: later(() => onChoose("library")) },
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
