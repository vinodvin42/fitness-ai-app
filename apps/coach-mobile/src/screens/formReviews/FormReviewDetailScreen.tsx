import React, { useEffect, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchFormReview, submitFormReview } from "../../api/formReviews";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

const MAX_NOTE = 2000;

/**
 * Review one clip. No video playback dependency (expo-av/expo-video/
 * react-native-webview) is installed in this app, so the clip itself is not
 * rendered; metadata is shown and the note can still be written.
 */
export function FormReviewDetailScreen() {
  const navigation = useNavigation();
  const { id } = useRoute<RouteProp<MoreStackParamList, "FormReviewDetail">>().params;
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["coach-form-review", id], queryFn: () => fetchFormReview(id) });
  const [note, setNote] = useState("");

  useEffect(() => {
    if (query.data?.coachNote) setNote(query.data.coachNote);
  }, [query.data?.coachNote]);

  const mutation = useMutation({
    mutationFn: () => submitFormReview(id, { coachNote: note.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-form-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["coach-form-review", id] });
      Alert.alert("Review sent", "Your client has been notified.");
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't submit", extractErrorMessage(err, "Please try again.")),
  });

  const item = query.data;
  const canSubmit = note.trim().length > 0 && note.length <= MAX_NOTE;

  return (
    <ScreenContainer title="Form review">
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
        ‹ Form reviews
      </Text>
      {query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : item ? (
        <View style={{ gap: spacing.md, marginTop: spacing.md }}>
          <Card>
            <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
              {item.userFirstName} · {item.exerciseName ?? "Exercise not specified"}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              Submitted {new Date(item.createdAt).toLocaleString()}
              {item.reviewedAt ? ` · Reviewed ${new Date(item.reviewedAt).toLocaleString()}` : ""}
            </Text>
            <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>
              {item.hasVideo
                ? "Video preview unavailable in this build. You can still write your feedback below."
                : "No video attached to this submission."}
            </Text>
          </Card>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={MAX_NOTE}
            placeholder="Your feedback on their form"
            placeholderTextColor={colors.textMuted}
            style={{
              minHeight: 120,
              color: colors.textPrimary,
              backgroundColor: colors.surface,
              borderRadius: radius.sm,
              padding: spacing.md,
              textAlignVertical: "top",
            }}
          />
          <Button
            label={item.status === "reviewed" ? "Update review" : "Submit review"}
            onPress={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canSubmit}
          />
        </View>
      ) : null}
    </ScreenContainer>
  );
}
