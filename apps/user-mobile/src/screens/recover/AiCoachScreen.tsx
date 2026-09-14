import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AiCoachMessage } from "@fitness-ai-app/types";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { Chip } from "../../components/Chip";
import { fetchAiCoachMessages, fetchAiProviderStatus, sendAiCoachMessage } from "../../api/aiCoach";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "AiCoach">;

// docs/mobile/03-screen-inventory.md §H: "guidance-topic chips ... quick-
// reply suggestion chips below the thread". This build ships one set as
// conversation starters above an empty thread — tapping one sends that
// prompt immediately rather than just filling the composer, since these
// are meant as a fast way in, not a draft to review first.
const GUIDANCE_CHIPS: Array<{ label: string; prompt: string }> = [
  { label: "Training Plan", prompt: "Can you help me think through my training plan for this week?" },
  { label: "Exercise Form", prompt: "What should I keep in mind to check my form on an exercise?" },
  { label: "Nutrition Advice", prompt: "Any nutrition advice based on how my training's been going?" },
  { label: "Recovery", prompt: "How should I think about recovery and rest days right now?" },
];

// docs/mobile/01-product-requirements.md's exact disclaimer text for this
// screen — kept verbatim, not paraphrased, since it's a real safety/
// liability disclosure, not decorative copy.
const DISCLAIMER =
  "AI Coach provides general fitness and wellness guidance only. Not a substitute for professional medical advice.";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function MessageBubble({ message }: { message: AiCoachMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      {!isUser && <Text style={styles.assistantLabel}>23Prime AI</Text>}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}>{message.content}</Text>
      </View>
      <Text style={[styles.timeLabel, isUser ? styles.timeLabelUser : styles.timeLabelAssistant]}>
        {formatTime(message.createdAt)}
      </Text>
    </View>
  );
}

/**
 * AI Coach Chat (docs/mobile/03-screen-inventory.md §H, docs/platform/roadmap.md
 * Phase 2 §H) — the screen half of gap §13, now that
 * apps/api/src/modules/aiCoach is real. Branded "23Prime AI" per the
 * design doc. **R1 Developer 1 U1 (14 Sep 2026):** relocated from its own
 * former Recover tab into MoreStack (see that file's own comment) — "AI
 * is global" per the R1 work package's own nav rule, so the real entry
 * point is now a banner on Today (`TodayScreen.tsx`'s `AIBanner`,
 * cross-tab deep-linking straight to `More` → `AiCoach`) rather than a
 * tab of its own. Not yet a true floating action button reachable from
 * every screen — the design's "AI Coach FAB on nearly every screen" would
 * need a global overlay reaching across every tab's own stack navigator,
 * real navigation-structure risk for a slice with no device to test
 * cross-navigator deep-linking against. Today's banner plus More's
 * "Recover" row are two real, always-reachable entry points; promoting
 * this to a true global FAB is a reasonable, self-contained follow-up,
 * not a compromise on whether AI Coach itself is real.
 *
 * Gated behind a real `GET /ai/status` check — if no provider is
 * configured server-side, this shows an honest "not available yet" panel
 * instead of a broken or fake chat, same "unconfigured means quietly off"
 * pattern as Razorpay elsewhere in this app.
 *
 * Not built this pass: streaming responses (every reply arrives as one
 * complete message, matching apps/api's own request/response design —
 * see aiCoach.service.ts) and attach/mic composer actions from the
 * design's fuller spec (no file/voice upload path exists anywhere in
 * this build for either).
 */
export function AiCoachScreen({ navigation: _navigation }: Props) {
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<AiCoachMessage>>(null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  const statusQuery = useQuery({ queryKey: ["ai-coach", "status"], queryFn: fetchAiProviderStatus });
  const isConfigured = statusQuery.data?.configured === true;

  const messagesQuery = useQuery({
    queryKey: ["ai-coach", "messages"],
    queryFn: fetchAiCoachMessages,
    enabled: isConfigured,
  });
  const messages = messagesQuery.data?.messages ?? [];

  const scrollToEnd = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setDraft("");
    setIsSending(true);
    try {
      await sendAiCoachMessage(trimmed);
      await queryClient.invalidateQueries({ queryKey: ["ai-coach", "messages"] });
      scrollToEnd();
    } catch (err) {
      // The user's own message is persisted server-side even when the
      // reply half fails (see aiCoach.service.ts) — refetch so it shows
      // up in the thread for real, then explain that only the reply
      // failed, not the send.
      await queryClient.invalidateQueries({ queryKey: ["ai-coach", "messages"] });
      Alert.alert("Coach couldn't respond", extractErrorMessage(err, "Try sending your message again in a moment."));
    } finally {
      setIsSending(false);
      scrollToEnd();
    }
  };

  if (statusQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.aiAccent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (statusQuery.isError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={{ padding: spacing.md }}>
          <ErrorState onRetry={() => statusQuery.refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isConfigured) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>23Prime AI</Text>
        </View>
        <View style={{ padding: spacing.md }}>
          <Card>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>AI Coach isn't available yet</Text>
            <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
              This server doesn't have an AI provider configured yet. Nothing's broken on your end — check back
              soon.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.onlineDot} />
          <Text style={styles.headerTitle}>23Prime AI</Text>
        </View>
        <Text style={styles.headerSubtitle}>Online</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {messagesQuery.isLoading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={colors.aiAccent} />
          </View>
        ) : messagesQuery.isError ? (
          <View style={{ padding: spacing.md }}>
            <ErrorState onRetry={() => messagesQuery.refetch()} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.threadContent}
            onContentSizeChange={scrollToEnd}
            ListEmptyComponent={
              <View style={{ paddingTop: spacing.lg, gap: spacing.md }}>
                <Card>
                  <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Hey — I'm 23Prime AI.</Text>
                  <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                    Ask me about your training, nutrition, or recovery — I'll ground my answers in your real
                    progress in this app. Try one of these, or just type below.
                  </Text>
                </Card>
                <View style={styles.chipRow}>
                  {GUIDANCE_CHIPS.map((c) => (
                    <Chip key={c.label} label={c.label} selected={false} onPress={() => send(c.prompt)} />
                  ))}
                </View>
              </View>
            }
            ListFooterComponent={
              isSending ? (
                <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
                  <Text style={styles.assistantLabel}>23Prime AI</Text>
                  <View style={[styles.bubble, styles.bubbleAssistant]}>
                    <ActivityIndicator color={colors.aiAccent} size="small" />
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {messages.length > 0 && (
          <View style={styles.chipRowInline}>
            {GUIDANCE_CHIPS.map((c) => (
              <Chip key={c.label} label={c.label} selected={false} onPress={() => send(c.prompt)} />
            ))}
          </View>
        )}

        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>

        <View style={styles.composerRow}>
          <TextInput
            style={styles.composerInput}
            placeholder="Ask your coach anything…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
            editable={!isSending}
          />
          <Pressable
            onPress={() => send(draft)}
            disabled={isSending || draft.trim().length === 0}
            style={[
              styles.sendButton,
              (isSending || draft.trim().length === 0) && styles.sendButtonDisabled,
            ]}
          >
            <Text style={styles.sendButtonLabel}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  headerTitle: { ...typography.h1, color: colors.textPrimary },
  headerSubtitle: { color: colors.aiAccent, ...typography.meta, marginTop: 2 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  threadContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  bubbleRow: { maxWidth: "84%" },
  bubbleRowUser: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleRowAssistant: { alignSelf: "flex-start", alignItems: "flex-start" },
  assistantLabel: { color: colors.aiAccent, ...typography.meta, fontFamily: fonts.bodySemi, marginBottom: 2, marginLeft: spacing.xs },
  bubble: { borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleUser: { backgroundColor: colors.accent },
  bubbleAssistant: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleTextUser: { color: "#0B0B0F", fontSize: 15, lineHeight: 21 },
  bubbleTextAssistant: { color: colors.textPrimary, fontSize: 15, lineHeight: 21 },
  timeLabel: { ...typography.meta, color: colors.textMuted, marginTop: 2 },
  timeLabelUser: { marginRight: spacing.xs },
  timeLabelAssistant: { marginLeft: spacing.xs },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chipRowInline: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  disclaimer: {
    color: colors.textMuted,
    ...typography.meta,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.aiAccent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonLabel: { color: "#0B0B0F", fontFamily: fonts.bodySemi, fontSize: 15 },
});
