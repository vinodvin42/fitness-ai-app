import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Exercise } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { BottomSheet } from "../../components/BottomSheet";
import { SearchBar } from "../../components/SearchBar";
import { Pill } from "../../components/Pill";
import { BrandMark } from "../../components/BrandMark";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { useToast } from "../../components/Toast";
import { createFormSubmission, fetchFormSubmissions } from "../../api/formAnalysis";
import { fetchExercises } from "../../api/programs";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "FormAnalysis">;

// The API takes the video inline as a data: URL inside a 10 MB JSON body, so
// the raw clip must stay well under that after base64 inflation (~4/3).
const MAX_VIDEO_BYTES = 6 * 1024 * 1024;

interface PickedClip {
  uri: string;
  sizeBytes: number | null;
  durationMs: number | null;
}

function toDataUrl(uri: string): Promise<string> {
  return fetch(uri)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read failed")));
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(blob);
        }),
    );
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Form Analysis (Train 18): pick an exercise, capture or choose a short clip,
 * review it, and submit. There is no AI analysis: submissions stay "queued for
 * coach review" until a human coach reviews them, and the copy says so.
 */
export function FormAnalysisScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [clip, setClip] = useState<PickedClip | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Explicit opt-in before any capture; never persisted, so every setup starts unchecked.
  const [consented, setConsented] = useState(false);
  const { colors: theme } = useTheme();
  const tabs = useNavigation<NavigationProp<MainTabsParamList>>();
  const [search, setSearch] = useState("");

  const exercisesQuery = useQuery({ queryKey: ["exercises"], queryFn: fetchExercises, enabled: pickerOpen });
  const listQuery = useQuery({ queryKey: ["formAnalysis"], queryFn: fetchFormSubmissions });

  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["formAnalysis"] });
    }, [queryClient]),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (exercisesQuery.data ?? []).filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [exercisesQuery.data, search]);

  const accept = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    if (a.fileSize != null && a.fileSize > MAX_VIDEO_BYTES) {
      setClip(null);
      setClipError(
        `That clip is ${mb(a.fileSize)}. Clips must be under ${mb(MAX_VIDEO_BYTES)}; record a shorter one (about 10 seconds) or pick a smaller file.`,
      );
      return;
    }
    setClipError(null);
    setClip({ uri: a.uri, sizeBytes: a.fileSize ?? null, durationMs: a.duration ?? null });
  };

  const record = async () => {
    if (!consented) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setClipError("Camera access is off. Enable it in your device settings, or choose a video from your library instead.");
      return;
    }
    accept(await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, videoMaxDuration: 10 }));
  };

  const choose = async () => {
    if (!consented) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setClipError("Library access is off. Enable it in your device settings, or record a clip instead.");
      return;
    }
    accept(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos }));
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!clip) throw new Error("No clip selected");
      const videoUrl = await toDataUrl(clip.uri);
      return createFormSubmission({ exerciseId: exercise?.id, videoUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formAnalysis"] });
      toast.show("Submitted. It's queued for coach review.", "success");
      setClip(null);
      setExercise(null);
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't submit that clip. Try a shorter one."), "error"),
  });

  const rows: Array<[string, string]> = [
    ["Position", "Stable phone, side or 45 degree view"],
    ["Frame", "Full body and weights visible, well lit"],
    ["Space", "Clear floor, no other people in view"],
  ];
  const guide = () => {
    if (exercise) navigation.navigate("ExerciseDetail", { exerciseId: exercise.id });
    else navigation.navigate("ExerciseLibrary");
  };

  return (
    <ScreenContainer
      title="Set up your form review"
      right={<BrandMark size={34} />}
    >
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ alignSelf: "flex-start", backgroundColor: colors.accentSoft, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Text style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 10 }}>Train / Form analysis setup</Text>
      </View>
      <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>
        {exercise ? `${exercise.name}. ` : ""}Capture a short clip for general technique feedback. This is not a medical assessment.
      </Text>

      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Exercise</Text>
        <Text style={{ color: colors.textSecondary }}>{exercise ? exercise.name : "Optional. Which lift is this?"}</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button label={exercise ? "Change" : "Pick exercise"} variant="secondary" onPress={() => setPickerOpen(true)} style={{ flex: 1 }} />
          {exercise ? <Button label="Clear" variant="secondary" onPress={() => setExercise(null)} style={{ flex: 1 }} /> : null}
        </View>
      </Card>

      <Card style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
          <Icon name="camera-off" size={26} color={colors.textMuted} />
          <Icon name="user" size={40} color={colors.textMuted} strokeWidth={1.5} />
        </View>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>Framing guide only. Camera not active</Text>
      </Card>

      <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Before you capture</Text>
      <Card style={{ paddingVertical: spacing.xs }}>
        {rows.map(([k, v], i) => (
          <View
            key={k}
            style={{
              flexDirection: "row",
              gap: spacing.md,
              paddingVertical: spacing.sm,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <Text style={{ color: colors.textMuted, ...typography.meta, width: 64 }}>{k}</Text>
            <Text style={{ color: colors.textPrimary, ...typography.body, fontSize: 13, flex: 1 }}>{v}</Text>
          </View>
        ))}
      </Card>

      <Card style={{ borderColor: colors.infoBorder, backgroundColor: colors.infoSurface, gap: spacing.sm }}>
        <Text style={{ color: theme.accent, ...typography.h3 }}>Choose whether to share a clip</Text>
        <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 12, lineHeight: 18 }}>
          Camera permission is separate from consent to process video. Only a clip you review and choose to submit is sent. Your clip is
          stored and waits in a queue for a human coach to review; there is no automatic analysis, and review times are not guaranteed.
        </Text>
        <Pressable
          onPress={() => setConsented((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consented }}
          accessibilityLabel="I agree to video processing for form feedback"
          style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              borderWidth: 1.5,
              borderColor: consented ? theme.accent : colors.borderStrong,
              backgroundColor: consented ? theme.accent : "transparent",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
          >
            {consented ? <Icon name="check" size={13} color={theme.textOnAccent} strokeWidth={3} /> : null}
          </View>
          <Text style={{ color: colors.textPrimary, ...typography.body, fontSize: 12, lineHeight: 18, flex: 1 }}>
            I agree to video processing for form feedback. I will review the clip before submitting it.
          </Text>
        </Pressable>
        <Pressable onPress={() => tabs.navigate("More", { screen: "PrivacySettings" })} accessibilityRole="link" hitSlop={8}>
          <Text style={{ color: theme.accent, ...typography.meta }}>Review video processing and retention details</Text>
        </Pressable>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          Capture, then review, retake or delete, then submit. You decide whether the clip is submitted.
        </Text>
      </Card>

      <Card style={{ borderColor: colors.warning, backgroundColor: colors.warningSoft, gap: spacing.xs }}>
        <Text style={{ color: colors.warning, ...typography.h3 }}>Feedback has limits</Text>
        <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 12, lineHeight: 18 }}>
          Camera angle, lighting and occlusion can make feedback inaccurate. It cannot diagnose injuries or confirm that a movement is safe.
          Stop if you feel pain. Ask a qualified professional if you are unsure; never push through pain to get a rep.
        </Text>
      </Card>

      {clip ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Review your clip</Text>
          <Text style={{ color: colors.textSecondary }}>
            {exercise ? exercise.name : "No exercise selected"}
            {clip.durationMs ? ` · ${Math.round(clip.durationMs / 1000)}s` : ""}
            {clip.sizeBytes ? ` · ${mb(clip.sizeBytes)}` : ""}
          </Text>
          <Button label="Submit for coach review" onPress={() => submit.mutate()} loading={submit.isPending} disabled={!consented} />
          <Button label="Remove clip" variant="secondary" onPress={() => setClip(null)} disabled={submit.isPending} />
        </Card>
      ) : (
        <>
          <Button label="Log sets manually" variant="secondary" onPress={() => navigation.navigate("Routines")} />
          {consented ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button label="Record" onPress={record} style={{ flex: 1 }} />
              <Button label="Choose video" variant="secondary" onPress={choose} style={{ flex: 1 }} />
            </View>
          ) : (
            <>
              <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>
                Select consent above to enable capture. No recording has started.
              </Text>
              <Button label="Consent required to capture" variant="secondary" disabled onPress={() => undefined} />
            </>
          )}
          <Button label="Use video guide instead" variant="secondary" onPress={guide} />
        </>
      )}
      {clipError ? <Text style={{ color: colors.danger }}>{clipError}</Text> : null}

      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Your submissions</Text>
      {listQuery.isError ? (
        <ErrorState onRetry={() => listQuery.refetch()} />
      ) : listQuery.isLoading ? (
        <Skeleton height={64} />
      ) : (listQuery.data ?? []).length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>No submissions yet.</Text>
      ) : (
        (listQuery.data ?? []).map((s) => (
          <Card key={s.id} style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3, flex: 1 }}>{s.exerciseName ?? "Exercise not specified"}</Text>
              <Pill label={s.status === "reviewed" ? "Reviewed" : "Queued for review"} tone={s.status === "reviewed" ? "success" : "warning"} />
            </View>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {new Date(s.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </Text>
            {s.coachNote ? (
              <Text style={{ color: colors.textSecondary }}>
                Coach note{s.reviewedAt ? ` (${new Date(s.reviewedAt).toLocaleDateString()})` : ""}: {s.coachNote}
              </Text>
            ) : null}
          </Card>
        ))
      )}

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Pick an exercise">
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search exercises" />
        {exercisesQuery.isLoading ? (
          <Skeleton height={48} />
        ) : exercisesQuery.isError ? (
          <ErrorState onRetry={() => exercisesQuery.refetch()} />
        ) : filtered.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>No exercises match.</Text>
        ) : (
          filtered.slice(0, 60).map((e) => (
            <Pressable
              key={e.id}
              onPress={() => {
                setExercise(e);
                setPickerOpen(false);
                setSearch("");
              }}
              accessibilityRole="button"
              accessibilityLabel={`Select ${e.name}`}
              style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text style={{ color: colors.textPrimary }}>{e.name}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta, textTransform: "capitalize" }}>{e.muscleGroup}</Text>
            </Pressable>
          ))
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
