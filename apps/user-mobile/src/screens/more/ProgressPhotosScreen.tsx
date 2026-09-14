import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProgressPhoto } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { createProgressPhoto, deleteProgressPhoto, fetchProgressPhotos } from "../../api/progress";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "ProgressPhotos">;

const THUMB_SIZE = 104;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

/**
 * Progress Photos (docs/mobile/03-screen-inventory.md §F), added 19 Aug
 * 2026 — real photo capture/upload via `expo-image-picker`, a real photo
 * grid, and a real "before/after" comparison, backed by a new
 * `ProgressPhoto` model/`GET`/`POST`/`DELETE /progress-photos`
 * (`apps/api/src/modules/progress`). Photos are compressed client-side
 * (JPEG quality 0.5) and stored as a base64 data URI directly in
 * Postgres — there's no object-storage backend (S3 or similar) anywhere
 * in this build, so this is the smallest real, working implementation
 * rather than a fake gallery with nothing actually persisted. See the
 * `ProgressPhoto` model's own doc comment in `schema.prisma` and gap §34
 * for the full tradeoff (no thumbnails, no CDN, a real per-photo size
 * ceiling).
 *
 * "Before/after slider comparison" is built the same way Workout
 * History's "Compare" already works (gap §27, added earlier the same
 * day) — select exactly two photos, see them side by side with their
 * dates — not a literal draggable overlay slider, since no slider/gesture
 * library is installed anywhere in this app. Tapping a photo outside
 * compare mode opens an inline detail view (full-size image + date +
 * a real, confirmed Delete action), rather than a separate screen.
 */
export function ProgressPhotosScreen(_props: Props) {
  const queryClient = useQueryClient();
  const { data: photos, isLoading, isError, refetch } = useQuery({
    queryKey: ["progressPhotos"],
    queryFn: fetchProgressPhotos,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [viewingPhotoId, setViewingPhotoId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

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

  const toggleCompareSelection = (id: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const items = photos ?? [];
  const viewingPhoto = items.find((p) => p.id === viewingPhotoId) ?? null;
  const compareEntries = items.filter((p) => selectedForCompare.includes(p.id));

  if (isError) {
    return (
      <ScreenContainer title="Progress Photos">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer title="Progress Photos">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Progress Photos">
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button label="Take Photo" onPress={onTakePhoto} loading={isSaving} style={{ flex: 1 }} />
        <Button label="Upload Photo" variant="secondary" onPress={onUploadPhoto} loading={isSaving} style={{ flex: 1 }} />
      </View>

      {items.length === 0 ? (
        <EmptyState
          title="No progress photos yet"
          subtitle="Take or upload one to start tracking your transformation."
          style={{ marginTop: spacing.lg }}
        />
      ) : (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg }}>
            <Text style={{ color: colors.textSecondary }}>Photos</Text>
            <Button
              label={compareMode ? "Cancel Compare" : "Compare"}
              variant="secondary"
              onPress={() => {
                setCompareMode((v) => !v);
                setSelectedForCompare([]);
                setViewingPhotoId(null);
              }}
              style={{ height: 36, paddingHorizontal: spacing.md }}
            />
          </View>

          {compareMode && compareEntries.length === 2 ? (
            <Card style={{ marginTop: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Before / After</Text>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                {[...compareEntries].sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime()).map((p, i) => (
                  <View key={p.id} style={{ flex: 1, alignItems: "center" }}>
                    <Image source={{ uri: p.imageData }} style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: radius.card }} />
                    <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
                      {i === 0 ? "Before" : "After"} · {fmtDate(p.takenAt)}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {!compareMode && viewingPhoto ? (
            <Card style={{ marginTop: spacing.sm }}>
              <Image source={{ uri: viewingPhoto.imageData }} style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: radius.card }} />
              <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>{fmtDate(viewingPhoto.takenAt)}</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <Button label="Close" variant="secondary" onPress={() => setViewingPhotoId(null)} style={{ flex: 1 }} />
                <Button label="Delete" variant="secondary" onPress={() => onDelete(viewingPhoto)} style={{ flex: 1 }} />
              </View>
            </Card>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
            {items.map((photo) => {
              const selected = compareMode && selectedForCompare.includes(photo.id);
              return (
                <Pressable
                  key={photo.id}
                  onPress={() =>
                    compareMode ? toggleCompareSelection(photo.id) : setViewingPhotoId(photo.id === viewingPhotoId ? null : photo.id)
                  }
                >
                  <Image
                    source={{ uri: photo.imageData }}
                    style={{
                      width: THUMB_SIZE,
                      height: THUMB_SIZE,
                      borderRadius: radius.sm,
                      borderWidth: selected ? 2 : 0,
                      borderColor: colors.accent,
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}
