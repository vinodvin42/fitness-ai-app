import React from "react";
import { ExerciseMenuSheet, type ExerciseMenuItem } from "./ExerciseMenuSheet";
import type { PhotoSource } from "../lib/profilePhoto";

/**
 * Profile photo actions (20 Oct 2026), opened from the avatar on Profile and
 * View Profile: upload a photo from the gallery, take one, or remove the
 * current one. The camera or gallery opens once the sheet has closed.
 * 25 Oct 2026 (owner): these choices appear only here, from the avatar's
 * camera button; the buttons that used to sit under the avatar are gone.
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
