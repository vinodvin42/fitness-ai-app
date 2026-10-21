import { useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProfilePhoto } from "@fitness-ai-app/types";
import { deleteProfilePhoto, fetchProfilePhoto, saveProfilePhoto } from "../api/users";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage } from "./apiError";
import { squarePhotoActions } from "./profilePhotoCrop";

/**
 * Profile photo (20 Oct 2026): the member's own picture, set from Profile or
 * View Profile by taking a photo or choosing one from the gallery. The picker
 * crops it square; it is then shrunk to 512 px and saved as a JPEG data URI
 * (the API keeps it in Postgres, see UserProfilePhoto in apps/api's
 * schema.prisma). Held in memory only: lib/queryClient.ts never persists
 * photos to the device, and sign-out clears it.
 *
 * Android can close the app while the camera or gallery is open (low memory);
 * the picked photo then waits in ImagePicker.getPendingResultAsync().
 * useRecoverProfilePhoto (mounted on Today, where the app reopens) saves it,
 * but only when this member had started a profile photo pick (a small marker
 * in AsyncStorage), so a Progress Photo is never taken for a profile photo.
 */
export const PROFILE_PHOTO_KEY = ["profilePhoto"] as const;

export type PhotoSource = "camera" | "library";

const PICK_MARKER_KEY = "fx.profilePhoto.pickStarted";
const PICK_MARKER_MAX_AGE_MS = 15 * 60_000;

/** The signed-in member's profile photo (null when none is set). */
export function useProfilePhoto() {
  const { user } = useAuth();
  return useQuery({ queryKey: PROFILE_PHOTO_KEY, queryFn: fetchProfilePhoto, enabled: !!user, staleTime: 10 * 60_000 });
}

/**
 * Opens the camera or the gallery (asking for access first) and returns the
 * photo as a square 512 px JPEG data URI, or null when cancelled or refused.
 */
export async function pickProfilePhoto(source: PhotoSource, userId?: string): Promise<string | null> {
  const camera = source === "camera";
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    Alert.alert(
      camera ? "Camera access needed" : "Photo library access needed",
      camera
        ? "Enable camera access in your device Settings to take a profile photo."
        : "Enable photo access in your device Settings to choose a profile photo.",
    );
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { allowsEditing: true, aspect: [1, 1], quality: 1 };
  const marked = Platform.OS === "android" && !!userId;
  if (marked) await AsyncStorage.setItem(PICK_MARKER_KEY, `${userId}|${Date.now()}`).catch(() => undefined);
  let result: ImagePicker.ImagePickerResult;
  try {
    result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  } finally {
    if (marked) await AsyncStorage.removeItem(PICK_MARKER_KEY).catch(() => undefined);
  }
  const asset = result.canceled ? null : result.assets[0];
  return asset?.uri ? toProfilePhotoData(asset) : null;
}

/** A picked photo as a square 512 px JPEG data URI. */
async function toProfilePhotoData(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
  const out = await manipulateAsync(asset.uri, squarePhotoActions(asset.width, asset.height), {
    compress: 0.8,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}

/** Take / choose / remove, with the saving state and error alerts the screens share. */
export function useProfilePhotoActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const choose = async (source: PhotoSource) => {
    let imageData: string | null;
    try {
      imageData = await pickProfilePhoto(source, user?.id);
    } catch {
      Alert.alert(source === "camera" ? "Couldn't open the camera" : "Couldn't open your photos", "Please try again.");
      return;
    }
    if (!imageData) return;
    setBusy(true);
    try {
      const photo = await saveProfilePhoto(imageData);
      queryClient.setQueryData<ProfilePhoto | null>(PROFILE_PHOTO_KEY, photo);
    } catch (err) {
      Alert.alert("Couldn't save photo", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert("Remove profile photo?", "Your initials will show instead.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteProfilePhoto();
            queryClient.setQueryData<ProfilePhoto | null>(PROFILE_PHOTO_KEY, null);
          } catch (err) {
            Alert.alert("Couldn't remove photo", extractErrorMessage(err, "Check your connection and try again."));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return { busy, choose, remove };
}

/**
 * Android only: saves a profile photo that was picked while Android closed the
 * app (see the note at the top). Best effort and silent; does nothing elsewhere.
 */
export function useRecoverProfilePhoto() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  useEffect(() => {
    if (Platform.OS !== "android" || !userId) return;
    void (async () => {
      try {
        const marker = await AsyncStorage.getItem(PICK_MARKER_KEY);
        if (!marker) return;
        await AsyncStorage.removeItem(PICK_MARKER_KEY);
        const [owner, startedAt] = marker.split("|");
        if (owner !== userId || !(Date.now() - Number(startedAt) < PICK_MARKER_MAX_AGE_MS)) return;
        const pending = await ImagePicker.getPendingResultAsync();
        const picked = pending.find((r): r is ImagePicker.ImagePickerSuccessResult => "canceled" in r && !r.canceled);
        const asset = picked?.assets[0];
        if (!asset?.uri) return;
        const imageData = await toProfilePhotoData(asset);
        if (!imageData) return;
        queryClient.setQueryData<ProfilePhoto | null>(PROFILE_PHOTO_KEY, await saveProfilePhoto(imageData));
      } catch {
        // Nothing to recover, or it couldn't be saved: the member can pick the photo again.
      }
    })();
  }, [userId, queryClient]);
}
