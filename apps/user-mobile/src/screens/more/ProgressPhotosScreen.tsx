import React, { useState } from "react";
import { Alert, Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BodyMeasurement, ProgressPhoto } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { BeforeAfterSlider } from "../../components/BeforeAfterSlider";
import { createProgressPhoto, deleteProgressPhoto, fetchMeasurements, fetchProgressPhotos } from "../../api/progress";
import { extractErrorMessage } from "../../lib/apiError";
import { BRAND_NAME } from "../../lib/brand";
import { useMeasureUnits } from "../../lib/measureUnits";
import { colors, layout, radius, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "ProgressPhotos">;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Weight logged closest to the photo's date, only if within a week of it - never an invented value. */
function weightNear(photo: ProgressPhoto, rows: BodyMeasurement[]): number | null {
  const t = new Date(photo.takenAt).getTime();
  let best: { kg: number; gap: number } | null = null;
  for (const r of rows) {
    if (r.weightKg == null) continue;
    const gap = Math.abs(new Date(r.loggedAt).getTime() - t);
    if (gap <= WEEK_MS && (!best || gap < best.gap)) best = { kg: r.weightKg, gap };
  }
  return best?.kg ?? null;
}

const monthYearUpper = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" }).toUpperCase();
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Gallery (Figma Progress 06). Real photos only (base64 in Postgres, see the
 * ProgressPhoto model): the Transformation Slider compares your FIRST and
 * LATEST photo with a draggable divider, the Timeline Grid lists every photo
 * with its date and the weight you logged within a week of it (omitted when
 * none). With fewer than two photos the slider is replaced by an honest prompt.
 */
export function ProgressPhotosScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const units = useMeasureUnits();
  const { width } = useWindowDimensions();
  const inner = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.md * 2;
  const thumb = (inner - spacing.sm * 2) / 3;
  const { data: photos, isLoading, isError, refetch } = useQuery({ queryKey: ["progressPhotos"], queryFn: fetchProgressPhotos });
  const { data: measurements } = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });

  const [isSaving, setIsSaving] = useState(false);
  const [viewingPhotoId, setViewingPhotoId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["progressPhotos"] });

  const savePhoto = async (base64: string) => {
    setIsSaving(true);
    try {
      await createProgressPhoto({ imageData: `data:image/jpeg;base64,${base64}` });
      await refresh();
    } catch (err) {
      Alert.alert("Couldn't save photo", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const onTakePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Camera access needed", "Enable camera access in your device Settings to take a progress photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, allowsEditing: true, aspect: [3, 4] });
    if (result.canceled || !result.assets[0]?.base64) return;
    await savePhoto(result.assets[0].base64);
  };

  const onUploadPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Photo library access needed", "Enable photo access in your device Settings to upload a progress photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5, allowsEditing: true, aspect: [3, 4] });
    if (result.canceled || !result.assets[0]?.base64) return;
    await savePhoto(result.assets[0].base64);
  };

  const onDelete = (photo: ProgressPhoto) => {
    Alert.alert("Delete this photo?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteProgressPhoto(photo.id);
            setViewingPhotoId(null);
            await refresh();
          } catch (err) {
            Alert.alert("Couldn't delete photo", extractErrorMessage(err, "Check your connection and try again."));
          }
        },
      },
    ]);
  };

  const items = photos ?? [];
  const rows = measurements ?? [];
  const viewing = items.find((p) => p.id === viewingPhotoId) ?? null;
  const wtLabel = (p: ProgressPhoto) => {
    const kg = weightNear(p, rows);
    return kg == null ? null : `${units.wt(kg).toFixed(1)} ${units.wtUnit}`;
  };

  const header = { title: "Gallery", eyebrow: BRAND_NAME, subtitle: "Transformation Progress" };

  if (isError) {
    return (
      <ScreenContainer {...header}>
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }
  if (isLoading) {
    return (
      <ScreenContainer {...header}>
        <SkeletonCard lines={4} />
      </ScreenContainer>
    );
  }

  const earliest = items[items.length - 1];
  const latest = items[0];

  return (
    <ScreenContainer {...header}>
      <BackButton onPress={() => navigation.goBack()} />

      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Transformation Slider</Text>
        {items.length >= 2 ? (
          <>
            <BeforeAfterSlider
              before={{ uri: earliest.imageData, label: monthYearUpper(earliest.takenAt), caption: wtLabel(earliest) }}
              after={{ uri: latest.imageData, label: monthYearUpper(latest.takenAt), caption: wtLabel(latest) }}
            />
            <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>
              {"<- Drag to compare transformation progress ->"}
            </Text>
          </>
        ) : (
          <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
            {items.length === 0
              ? "Add two or more progress photos and you can drag to compare your first and latest."
              : "You have one photo so far. Add another later and you can drag to compare your first and latest."}
          </Text>
        )}
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable
          onPress={onTakePhoto}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="Take Photo"
          style={{ flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.accent, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", opacity: isSaving ? 0.6 : 1 }}
        >
          <Icon name="camera" size={18} color={colors.textOnAccent} />
          <Text style={{ color: colors.textOnAccent, ...typography.label }}>Take Photo</Text>
        </Pressable>
        <Pressable
          onPress={onUploadPhoto}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="Upload photo"
          style={{ flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", opacity: isSaving ? 0.6 : 1 }}
        >
          <Icon name="upload" size={18} color={colors.textPrimary} />
          <Text style={{ color: colors.textPrimary, ...typography.label }}>Upload</Text>
        </Pressable>
      </View>

      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Timeline Grid</Text>
        {items.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>No progress photos yet. Take or upload one to start your timeline.</Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {items.map((photo) => {
              const w = wtLabel(photo);
              return (
                <Pressable
                  key={photo.id}
                  onPress={() => setViewingPhotoId(photo.id === viewingPhotoId ? null : photo.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo from ${new Date(photo.takenAt).toLocaleDateString()}${w ? `, ${w}` : ""}`}
                  style={{ width: thumb }}
                >
                  <Image
                    source={{ uri: photo.imageData }}
                    style={{
                      width: thumb,
                      height: thumb * 1.15,
                      borderRadius: radius.sm,
                      borderWidth: photo.id === viewingPhotoId ? 2 : 0,
                      borderColor: colors.accent,
                    }}
                  />
                  <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{dayMonth(photo.takenAt)}</Text>
                  {w ? <Text style={{ color: colors.textMuted, ...typography.caption }}>{w}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      {viewing ? (
        <Card style={{ gap: spacing.sm }}>
          <Image source={{ uri: viewing.imageData }} style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: radius.card }} />
          <Text style={{ color: colors.textSecondary }}>
            {new Date(viewing.takenAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            {wtLabel(viewing) ? ` · ${wtLabel(viewing)}` : ""}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label="Close" variant="secondary" onPress={() => setViewingPhotoId(null)} style={{ flex: 1 }} />
            <Button label="Delete" variant="secondary" onPress={() => onDelete(viewing)} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}
    </ScreenContainer>
  );
}
