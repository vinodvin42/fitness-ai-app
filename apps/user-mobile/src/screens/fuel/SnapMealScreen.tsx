import React, { useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { CameraPermissionDenied } from "../../components/CameraPermissionDenied";
import { createFoodEstimate } from "../../api/nutrition";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "SnapMeal">;

// Conservative JPEG quality: expo-image-manipulator isn't installed, so
// quality is the only client-side size lever. The API caps the data URL at
// ~1.5M base64 chars; we check the same limit here to fail early.
const PHOTO_QUALITY = 0.3;
const MAX_BASE64_CHARS = 1_500_000;

interface Photo {
  uri: string;
  dataUrl: string;
}

function toPhoto(uri: string, base64: string | null | undefined, mimeType?: string | null): Photo | null {
  if (!base64) return null;
  const type = mimeType === "image/png" ? "image/png" : "image/jpeg";
  return { uri, dataUrl: `data:${type};base64,${base64}` };
}

/**
 * Snap a meal (Fuel 09) — camera (or library) photo -> review -> POST
 * /food-estimates with `imageDataUrl` -> the existing ConfirmFoodEstimate
 * screen. The photo is only sent for the estimate; the server doesn't store
 * it. Estimates from photos are approximate and always user-reviewed.
 */
export function SnapMealScreen({ route, navigation }: Props) {
  const { mealType } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = (p: Photo | null) => {
    if (!p) {
      setError("Couldn't read that photo. Please try another.");
      return;
    }
    if (p.dataUrl.length > MAX_BASE64_CHARS) {
      setError("That photo is too large to upload. Try retaking it or choose a smaller one.");
      return;
    }
    setError(null);
    setPhoto(p);
  };

  const onCapture = async () => {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: PHOTO_QUALITY, base64: true });
      accept(pic ? toPhoto(pic.uri, pic.base64, "image/jpeg") : null);
    } catch {
      setError("Couldn't take the photo. Please try again.");
    } finally {
      setCapturing(false);
    }
  };

  const onPickFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: PHOTO_QUALITY,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      accept(toPhoto(a.uri, a.base64, a.mimeType));
    } catch {
      setError("Couldn't open your photo library.");
    }
  };

  const onSubmit = async () => {
    if (!photo || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const estimate = await createFoodEstimate({ mealType, imageDataUrl: photo.dataUrl });
      if (estimate.status === "insufficient_context") {
        setError(
          estimate.failureReason ??
            "We couldn't tell what's in this photo. Retake it, or log the meal manually.",
        );
        return;
      }
      navigation.replace("ConfirmFoodEstimate", { estimate });
    } catch (err) {
      setError(extractErrorMessage(err, "Photo estimates aren't available right now. Check your connection and retry, or log manually."));
    } finally {
      setSubmitting(false);
    }
  };

  const logManually = () => navigation.navigate("LogMeal", { mealType });

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Review step works regardless of camera permission (e.g. a library photo).
  if (photo) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />
        <View style={styles.footer}>
          {submitting ? (
            <View style={styles.banner}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.bannerText}>Estimating your meal...</Text>
            </View>
          ) : null}
          {error ? (
            <View style={styles.banner}>
              <Text style={[styles.bannerText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}
          <Text style={styles.disclaimer}>Photo estimates are approximate. You can review and edit before logging.</Text>
          <Button label={error ? "Retry" : "Use photo"} onPress={onSubmit} loading={submitting} />
          <Button
            label="Retake"
            variant="secondary"
            onPress={() => {
              setPhoto(null);
              setError(null);
            }}
            disabled={submitting}
          />
          {error ? <Button label="Log manually" variant="secondary" onPress={logManually} disabled={submitting} /> : null}
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <CameraPermissionDenied
        variant="snap"
        onRequestPermission={permission.canAskAgain ? requestPermission : undefined}
        onManual={logManually}
        onBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />
      <View style={styles.footer}>
        {error ? (
          <View style={styles.banner}>
            <Text style={[styles.bannerText, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}
        <Text style={styles.disclaimer}>Frame your meal. Photo estimates are approximate.</Text>
        <Button label="Capture" onPress={onCapture} loading={capturing} />
        <Button label="Choose from library" variant="secondary" onPress={onPickFromLibrary} />
        <Button label="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing.lg },
  footer: { position: "absolute", bottom: spacing.xl, left: spacing.lg, right: spacing.lg, gap: spacing.sm },
  disclaimer: { ...typography.caption, color: "#fff", textAlign: "center" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bannerText: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
});
