import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { fetchSessionRating, rateSession, type SessionRatingTag } from "../../api/coachSessions";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "RateSession">;

export const STAR_LABEL = ["", "Poor", "Fair", "Okay", "Good", "Great"];
const TAGS: Array<{ id: SessionRatingTag; label: string }> = [
  { id: "clear_guidance", label: "Clear guidance" },
  { id: "on_time", label: "On time" },
  { id: "useful_plan_changes", label: "Useful plan changes" },
  { id: "good_listener", label: "Good listener" },
];

/**
 * Rate session (Figma coach/11; its own screen since 25 Oct 2026, opened from Session Complete): stars,
 * what went well and an optional comment, saved privately for this professional (PUT
 * /coaching/bookings/:id/rating). Rating again updates it.
 *
 * The Figma's "Sarah sees your rating without your name. You can edit it for 7 days" isn't built
 * (neither anonymity nor an edit window exists in the API), so the existing plain line is kept.
 */
export function RateSessionScreen({ navigation, route }: Props) {
  const { bookingId, coachName, context } = route.params;
  const { colors: theme } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ["coaching", "bookings", bookingId, "rating"];
  const { data } = useQuery({ queryKey: key, queryFn: () => fetchSessionRating(bookingId) });
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<SessionRatingTag[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const first = coachName.split(" ")[0] || coachName;

  useEffect(() => {
    if (loaded || data === undefined) return;
    if (data) {
      setStars(data.stars);
      setTags(data.tags as SessionRatingTag[]);
      setComment(data.comment ?? "");
    }
    setLoaded(true);
  }, [data, loaded]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await rateSession(bookingId, { stars, tags, comment: comment.trim() || undefined });
      queryClient.setQueryData(key, saved);
      toast.show(`Thanks. ${first} will see your rating.`, "success");
      navigation.goBack();
    } catch (err) {
      toast.show(extractErrorMessage(err, "Couldn't save your rating. Try again."), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer title="Rate session" onBack={() => navigation.goBack()}>
      <View style={{ gap: 18 }}>
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 27 }}>
            How was your session with {first}?
          </Text>
          {context ? <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{context}</Text> : null}
        </View>

        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              onPress={() => setStars(n)}
              accessibilityRole="radio"
              accessibilityState={{ checked: stars === n }}
              accessibilityLabel={`${n} of 5, ${STAR_LABEL[n]}`}
              hitSlop={4}
            >
              <Icon name="star" size={36} color={n <= stars ? colors.warning : colors.textMuted} fill={n <= stars ? colors.warning : "none"} />
            </Pressable>
          ))}
        </View>
        <Text style={{ color: stars > 0 ? colors.textPrimary : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 15 }}>
          {stars > 0 ? `${stars} of 5 · ${STAR_LABEL[stars]}` : "Tap a star to rate"}
        </Text>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>What went well?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {TAGS.map((t) => {
              const on = tags.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTags((cur) => (on ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: on ? theme.accentSoft : colors.surfaceHigh }}
                >
                  <Text style={{ color: on ? theme.accentText : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Add a comment (optional)"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Add a comment (optional)"
          multiline
          maxLength={1000}
          style={{
            minHeight: 56,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
            color: colors.textPrimary,
            textAlignVertical: "top",
          }}
        />
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>{first} sees your rating and comment. It isn't shown to anyone else.</Text>

        <Button label={data ? "Update rating" : "Submit rating"} onPress={() => void save()} loading={saving} disabled={saving || stars === 0} />
        <Button label="Skip" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </ScreenContainer>
  );
}
