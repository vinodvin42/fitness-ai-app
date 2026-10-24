import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { useToast } from "./Toast";
import { fetchSessionRating, rateSession, type SessionRatingTag } from "../api/coachSessions";
import { extractErrorMessage } from "../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const STAR_LABEL = ["", "Poor", "Fair", "Okay", "Good", "Great"];
const TAGS: Array<{ id: SessionRatingTag; label: string }> = [
  { id: "clear_guidance", label: "Clear guidance" },
  { id: "on_time", label: "On time" },
  { id: "useful_plan_changes", label: "Useful plan changes" },
  { id: "good_listener", label: "Good listener" },
];

/**
 * "How was your session?" (Figma coach/11, 24 Oct 2026): stars, what went
 * well, an optional comment. Private: only this coach sees it (PUT
 * /coaching/bookings/:id/rating). Shown once the session has taken place.
 */
export function SessionRatingCard({ bookingId, coachName }: { bookingId: string; coachName: string }) {
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
    } catch (err) {
      toast.show(extractErrorMessage(err, "Couldn't save your rating. Try again."), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <Text style={{ color: colors.textPrimary, ...typography.h3 }}>How was your session with {first}?</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setStars(n)}
            accessibilityRole="radio"
            accessibilityState={{ checked: stars === n }}
            accessibilityLabel={`${n} of 5, ${STAR_LABEL[n]}`}
            hitSlop={4}
          >
            <Icon name="star" size={28} color={n <= stars ? colors.warning : colors.textMuted} fill={n <= stars ? colors.warning : "none"} />
          </Pressable>
        ))}
        {stars > 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginLeft: spacing.xs }}>
            {stars} of 5 · {STAR_LABEL[stars]}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>What went well?</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {TAGS.map((t) => {
          const on = tags.includes(t.id);
          return (
            <Pressable
              key={t.id}
              onPress={() => setTags((cur) => (on ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: on ? theme.accent : colors.border,
                backgroundColor: on ? theme.accent : colors.surface,
              }}
            >
              <Text style={{ color: on ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{t.label}</Text>
            </Pressable>
          );
        })}
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
          minHeight: 64,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceRaised,
          padding: spacing.sm,
          color: colors.textPrimary,
          textAlignVertical: "top",
        }}
      />
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{first} sees your rating and comment. It isn't shown to anyone else.</Text>
      <Button label={data ? "Update rating" : "Send rating"} onPress={save} loading={saving} disabled={saving || stars === 0} />
    </View>
  );
}
