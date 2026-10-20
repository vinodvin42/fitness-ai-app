import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Avatar } from "./Avatar";
import { colors, radius } from "../theme/tokens";
import { useProfilePhoto } from "../lib/profilePhoto";

/**
 * The signed-in member's own avatar: their profile photo when one is set
 * (lib/profilePhoto.ts), otherwise their initials. `busy` dims it with a
 * spinner while a new photo is saving.
 */
export function MyAvatar({ name, size = 40, busy = false }: { name?: string | null; size?: number; busy?: boolean }) {
  const photo = useProfilePhoto();
  return (
    <View>
      <Avatar name={name} uri={photo.data?.imageData ?? null} size={size} />
      {busy ? (
        <View
          accessibilityLabel="Saving photo"
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: radius.pill,
            backgroundColor: colors.overlay,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      ) : null}
    </View>
  );
}
