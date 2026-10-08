import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AiCoachMessage } from "@fitness-ai-app/types";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { AiLimitReached } from "../../components/AiLimitReached";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ReasoningSheet } from "../../components/ReasoningSheet";
import { InfoCard, StateLayout } from "../../components/StatePanels";
import {
  clearAiCoachConversation,
  fetchAiCoachMessages,
  fetchAiCoachUsage,
  fetchAiProviderStatus,
  sendAiCoachMessage,
} from "../../api/aiCoach";
import { useAuth } from "../../context/AuthContext";
import { clearDraft, loadDraft, newClientId, saveDraft, type AiCoachDraft } from "../../lib/aiCoachDraft";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import type { MainTabsParamList } from "../../navigation/MainTabs";

type Props = NativeStackScreenProps<RecoverStackParamList, "AiCoach">;

// docs/mobile/03-screen-inventory.md §H: "guidance-topic chips". Tapping one
// sends that canned prompt immediately (a fast way in, not a draft to review).
const GUIDANCE_CHIPS: Array<{ label: string; prompt: string }> = [
  { label: "Training Plan", prompt: "Can you help me think through my training plan for this week?" },
  { label: "Exercise Form", prompt: "What should I keep in mind to check my form on an exercise?" },
  { label: "Nutrition Advice", prompt: "Any nutrition advice based on how my training's been going?" },
  { label: "Recovery", prompt: "How should I think about recovery and rest days right now?" },
];

// Static starter prompts offered above the composer, picked by a simple
// keyword match on the last assistant reply. They are fixed suggestions, not
// AI-generated follow-ups.
const QUICK_REPLIES = {
  nutrition: ["What should I eat post-workout?", "How much protein should I aim for?", "Suggest a quick high-protein snack"],
  training: ["Suggest a chest exercise", "How many sets and reps should I do?", "How do I progress this safely?"],
  recovery: ["How can I recover faster?", "Should I take a rest day?", "How does sleep affect my training?"],
  general: ["What should I eat post-workout?", "Suggest a chest exercise", "How should I plan my week?"],
};

function quickRepliesFor(lastAssistant: string | undefined): string[] {
  const t = (lastAssistant ?? "").toLowerCase();
  if (/protein|meal|eat|food|nutrition|calorie|snack/.test(t)) return QUICK_REPLIES.nutrition;
  if (/sleep|recover|rest day|sore/.test(t)) return QUICK_REPLIES.recovery;
  if (/workout|exercise|train|reps|sets|lift/.test(t)) return QUICK_REPLIES.training;
  return QUICK_REPLIES.general;
}

// docs/mobile/01-product-requirements.md's exact disclaimer text for this
// screen — kept verbatim, not paraphrased, since it's a real safety/
// liability disclosure, not decorative copy.
const DISCLAIMER =
  "Fynrox AI provides general fitness and wellness guidance only. Not a substitute for professional medical advice.";

const TIER_LABEL = { basic: "Basic", pro: "Pro", elite: "Elite" } as const;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function AssistantAvatar() {
  return (
    <View style={styles.avatar}>
      <Icon name="sparkles" size={13} color={colors.aiAccent} />
    </View>
  );
}

function MessageBubble({ message, onWhy }: { message: AiCoachMessage; onWhy: (m: AiCoachMessage) => void }) {
  const { colors: theme } = useTheme();
  const isUser = message.role === "user";
  const hasSources = !isUser && (message.sources?.length ?? 0) > 0;
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      {!isUser && <AssistantAvatar />}
      <View
        style={[
          styles.bubble,
          isUser ? [styles.bubbleUser, { backgroundColor: theme.accent }] : styles.bubbleAssistant,
        ]}
      >
        <Text style={isUser ? [styles.bubbleTextUser, { color: theme.textOnAccent }] : styles.bubbleTextAssistant}>
          {message.content}
        </Text>
        {hasSources ? (
          <Pressable
            onPress={() => onWhy(message)}
            accessibilityRole="button"
            accessibilityLabel="Why this?"
            accessibilityHint="Shows what information this reply was based on"
            style={styles.whyLink}
            hitSlop={8}
          >
            <Text style={styles.whyText}>Why this?</Text>
            <Icon name="info" size={13} color={colors.aiAccent} />
          </Pressable>
        ) : null}
        <Text style={[styles.timeLabel, isUser && { color: theme.textOnAccent, opacity: 0.8 }]}>
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

/**
 * AI Coach (Figma section 07, AI 01-04): chat, "taking a pause" (service
 * unavailable), plan limit reached, and the "Why this?" sheet. The real
 * entry point is the banner on Today (cross-tab deep link).
 *
 * Behaviour notes:
 * - A failed send (503/network) opens the full-screen pause state with the
 *   unsent draft. The draft + its idempotency key are kept in AsyncStorage
 *   (lib/aiCoachDraft.ts), survive restarts, and are restored into the
 *   composer; "Retry with this draft" resends with the SAME clientId so the
 *   server never stores the message twice.
 * - HTTP 429 (ai_limit_reached) opens the plan-limit screen.
 * - "Why this?" only appears on replies that have server-recorded sources
 *   (the real context injected into that reply's prompt).
 * - The composer's "+" and mic are visibly disabled: there is no attachment
 *   or voice backend, so they are not faked.
 */
export function AiCoachScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const { colors: theme } = useTheme();
  const { user } = useAuth();
  const listRef = useRef<FlatList<AiCoachMessage>>(null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  // Set when a send fails; the failed text stays in `draft` so nothing is lost.
  const [sendFailure, setSendFailure] = useState<null | "unavailable" | "quota">(null);
  const [failedDraft, setFailedDraft] = useState<AiCoachDraft | null>(null);
  // Idempotency key of the draft currently in the composer (null = a fresh message).
  const clientIdRef = useRef<string | null>(null);
  const [whyMessage, setWhyMessage] = useState<AiCoachMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const statusQuery = useQuery({ queryKey: ["ai-coach", "status"], queryFn: fetchAiProviderStatus });
  const isConfigured = statusQuery.data?.configured === true;

  // Real daily quota (GET /ai-coach/usage): drives the AI 03 limit state and the settings usage line.
  const usageQuery = useQuery({ queryKey: ["ai-coach", "usage"], queryFn: fetchAiCoachUsage, enabled: isConfigured });
  const usage = usageQuery.data;
  const [limitDismissed, setLimitDismissed] = useState(false);
  const limitReached = sendFailure === "quota" || (usage != null && usage.used >= usage.limit);

  const messagesQuery = useQuery({
    queryKey: ["ai-coach", "messages"],
    queryFn: fetchAiCoachMessages,
    enabled: isConfigured,
  });
  const messages = messagesQuery.data?.messages ?? [];
  const lastMessage = messages[messages.length - 1];

  // Restore an unsent draft saved by a previous failed send (survives app restarts).
  useEffect(() => {
    let alive = true;
    loadDraft().then((d) => {
      if (!alive || !d) return;
      clientIdRef.current = d.clientId;
      setDraft((cur) => (cur ? cur : d.text));
      setFailedDraft(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const scrollToEnd = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  };

  const parentNav = () => navigation.getParent<NavigationProp<MainTabsParamList>>();

  /** `fromComposer` sends reuse the composer draft's idempotency key; canned prompts get a fresh one and leave the draft alone. */
  const send = async (text: string, fromComposer: boolean) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    const clientId = fromComposer ? (clientIdRef.current ?? newClientId()) : newClientId();
    if (fromComposer) {
      clientIdRef.current = clientId;
      setDraft("");
    }
    setSendFailure(null);
    setIsSending(true);
    setPendingText(trimmed);
    try {
      await sendAiCoachMessage(trimmed, clientId);
      if (fromComposer) {
        clientIdRef.current = null;
        setFailedDraft(null);
        await clearDraft();
      }
      await queryClient.invalidateQueries({ queryKey: ["ai-coach", "messages"] });
      queryClient.invalidateQueries({ queryKey: ["ai-coach", "usage"] });
      scrollToEnd();
    } catch (err) {
      // HTTP 429 (ai_limit_reached) opens the AI 03 screen; everything else
      // (network/503/...) is "temporarily unavailable" (AI 02). Either way the
      // text is kept as an unsent draft.
      const isQuota = axios.isAxiosError(err) && err.response?.status === 429;
      if (fromComposer) {
        setDraft(trimmed);
        const saved: AiCoachDraft = { text: trimmed, clientId, savedAt: new Date().toISOString() };
        setFailedDraft(saved);
        await saveDraft(saved);
      }
      if (isQuota) {
        setLimitDismissed(false);
        queryClient.invalidateQueries({ queryKey: ["ai-coach", "usage"] });
      }
      setSendFailure(isQuota ? "quota" : "unavailable");
    } finally {
      setIsSending(false);
      setPendingText(null);
      scrollToEnd();
    }
  };

  const clearConversation = async () => {
    setClearing(true);
    try {
      await clearAiCoachConversation();
      await queryClient.invalidateQueries({ queryKey: ["ai-coach", "messages"] });
      queryClient.invalidateQueries({ queryKey: ["ai-coach", "usage"] });
      setSettingsOpen(false);
      setConfirmClear(false);
    } finally {
      setClearing(false);
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
          <Text style={styles.headerTitle}>Fynrox AI</Text>
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

  if (limitReached && !limitDismissed) {
    return (
      <AiLimitReached
        usage={usage}
        onBack={() => navigation.goBack()}
        onKeepTracking={() => {
          setLimitDismissed(true);
          parentNav()?.navigate("Today");
        }}
        onUpgrade={() => parentNav()?.navigate("More", { screen: "Subscription" })}
      />
    );
  }

  // AI 02 — service unavailable: full-screen pause state with the unsent draft.
  if (sendFailure === "unavailable") {
    const firstName = user?.fullName?.split(" ")[0];
    const savedAt = failedDraft ? new Date(failedDraft.savedAt) : new Date();
    return (
      <StateLayout
        flowLabel="AI / Service unavailable"
        flowIcon="cloud-off"
        flowTone="ai"
        title="Fynrox AI is taking a pause"
        description="We couldn't get an answer right now. This is a temporary service issue, not your plan's usage limit."
        footnote="Your draft stays here. Retrying won't erase it."
        onBack={() => setSendFailure(null)}
        showBrand
        actions={[
          { label: "Retry with this draft", onPress: () => send(draft, true), loading: isSending },
          {
            label: "Continue manual tracking",
            variant: "secondary",
            onPress: () => {
              setSendFailure(null);
              parentNav()?.navigate("Today");
            },
          },
        ]}
      >
        <InfoCard
          tone="ai"
          title="Temporarily unavailable"
          body="No new AI response was generated. Retry when you're ready; we don't have a confirmed restoration time."
        />
        <View style={styles.draftCard}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>
              {firstName ? `${firstName} · ` : ""}Unsent draft
            </Text>
            <Pressable
              onPress={() => setSendFailure(null)}
              accessibilityRole="button"
              accessibilityLabel="Edit draft"
              hitSlop={10}
            >
              <Icon name="pencil" size={15} color={theme.accent} />
            </Pressable>
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 15, lineHeight: 21 }}>{draft}</Text>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            {savedAt.toLocaleString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </Text>
        </View>
        <InfoCard
          title="Your everyday tools still work"
          body="Keep logging meals, workouts and recovery manually. Your saved entries remain available while AI guidance is offline."
        />
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          AI offers general fitness and wellness guidance, not professional medical advice.
        </Text>
      </StateLayout>
    );
  }

  const canSend = !isSending && draft.trim().length > 0 && !limitReached;
  const quickReplies = !isSending && lastMessage?.role === "assistant" ? quickRepliesFor(lastMessage.content) : [];
  const whySources = whyMessage?.sources ?? [];
  const hasFoodSource = whySources.some((s) => s.kind === "protein_today");

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={[styles.header, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
        <View>
          <View style={styles.headerTitleRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.headerTitle}>Fynrox AI</Text>
          </View>
          <Text style={styles.headerSubtitle}>Online · Instant Answers</Text>
        </View>
        <Pressable
          onPress={() => {
            setConfirmClear(false);
            setSettingsOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="AI Coach settings"
          hitSlop={10}
        >
          <Icon name="settings" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.topChipScroll}
        contentContainerStyle={styles.topChipRow}
      >
        {GUIDANCE_CHIPS.map((c) => (
          <Pressable
            key={c.label}
            onPress={() => send(c.prompt, false)}
            disabled={isSending || limitReached}
            accessibilityRole="button"
            accessibilityLabel={c.label}
            style={[styles.topChip, (isSending || limitReached) && { opacity: 0.5 }]}
          >
            <Text style={styles.topChipText}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

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
            renderItem={({ item }) => <MessageBubble message={item} onWhy={setWhyMessage} />}
            contentContainerStyle={styles.threadContent}
            onContentSizeChange={scrollToEnd}
            ListEmptyComponent={
              pendingText ? null : (
                <View style={{ paddingTop: spacing.lg }}>
                  <Card>
                    <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Hey — I'm Fynrox AI.</Text>
                    <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                      Ask me about your training, nutrition, or recovery — I'll ground my answers in your real
                      progress in this app. Try one of the topics above, or just type below.
                    </Text>
                  </Card>
                </View>
              )
            }
            ListFooterComponent={
              isSending ? (
                <View style={{ gap: spacing.sm }}>
                  {pendingText ? (
                    <View style={[styles.bubbleRow, styles.bubbleRowUser]}>
                      <View style={[styles.bubble, styles.bubbleUser, { backgroundColor: theme.accent }]}>
                        <Text style={[styles.bubbleTextUser, { color: theme.textOnAccent }]}>{pendingText}</Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
                    <AssistantAvatar />
                    <View style={[styles.bubble, styles.bubbleAssistant]}>
                      <ActivityIndicator color={colors.aiAccent} size="small" />
                    </View>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {quickReplies.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickScroll}
            contentContainerStyle={styles.quickRow}
          >
            {quickReplies.map((q) => (
              <Pressable
                key={q}
                onPress={() => send(q, false)}
                disabled={limitReached}
                accessibilityRole="button"
                accessibilityLabel={q}
                style={styles.quickChip}
              >
                <Text style={[styles.quickChipText, { color: theme.accent }]}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {limitReached ? (
          <Pressable
            onPress={() => setLimitDismissed(false)}
            accessibilityRole="button"
            accessibilityLabel="AI limit reached. See options"
            style={styles.limitNotice}
          >
            <Text style={{ color: colors.aiAccent, ...typography.label }}>
              AI limit reached for now. Your draft is kept. Tap for options.
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.composerRow}>
          <View style={styles.composerPill}>
            <Pressable
              disabled
              accessibilityRole="button"
              accessibilityLabel="Attach"
              accessibilityHint="Attachments aren't available yet"
              accessibilityState={{ disabled: true }}
              style={styles.composerIcon}
            >
              <Icon name="plus" size={20} color={colors.textMuted} />
            </Pressable>
            <TextInput
              style={styles.composerInput}
              placeholder="Ask Fynrox AI anything…"
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              numberOfLines={1}
              maxLength={2000}
              editable={!isSending && !limitReached}
              accessibilityLabel="Message to AI Coach"
            />
            <Pressable
              disabled
              accessibilityRole="button"
              accessibilityLabel="Voice input"
              accessibilityHint="Voice input isn't available yet"
              accessibilityState={{ disabled: true }}
              style={styles.composerIcon}
            >
              <Icon name="mic" size={19} color={colors.textMuted} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => send(draft, true)}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend, busy: isSending }}
            style={[styles.sendButton, { backgroundColor: theme.accent }, !canSend && styles.sendButtonDisabled]}
          >
            <Icon name="arrow-up" size={20} color={theme.textOnAccent} />
          </Pressable>
        </View>

        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </KeyboardAvoidingView>

      <ReasoningSheet
        visible={whyMessage != null}
        onClose={() => setWhyMessage(null)}
        closeIcon
        intro="Here's what informed this reply, and where it may be wrong."
        heading="A suggestion, not a prescription"
        rationale="This reply is AI-generated guidance based on your message and the information listed below. Check it against your own logs and judgement."
        rows={whySources.map((s) => ({ label: s.label, value: s.value }))}
        generatedAt={whyMessage?.createdAt}
        caveat="Missing or out-of-date logs can change the answer. This is not a diagnosis or a clinical assessment."
        action={hasFoodSource ? { label: "Review and correct food logs", onPress: () => parentNav()?.navigate("Fuel") } : undefined}
        footnote="Correct your logs or profile to update the basis of future guidance. General wellness advice only."
      />

      <BottomSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} title="AI Coach settings" closeIcon>
        <InfoCard
          tone="ai"
          title="Today's usage"
          body={
            usage
              ? `${usage.used} of ${usage.limit} AI messages used on ${TIER_LABEL[usage.tier]}. Resets ${new Date(usage.resetsAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}.`
              : "Usage couldn't be loaded right now."
          }
        />
        {confirmClear ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>
              This permanently deletes your AI Coach messages. Your logs and plan aren't affected, and today's usage
              isn't refunded.
            </Text>
            <Button label="Delete conversation" onPress={clearConversation} loading={clearing} style={{ backgroundColor: colors.danger }} />
            <Button label="Cancel" variant="secondary" onPress={() => setConfirmClear(false)} disabled={clearing} />
          </View>
        ) : (
          <Button
            label="Clear conversation"
            variant="secondary"
            onPress={() => setConfirmClear(true)}
            disabled={messages.length === 0}
            accessibilityHint="Deletes your AI Coach messages after confirmation"
          />
        )}
      </BottomSheet>
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
  headerTitle: { ...typography.h1, fontSize: 18, color: colors.textPrimary },
  headerSubtitle: { color: colors.textSecondary, ...typography.meta, marginTop: 2, marginLeft: 16 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  topChipScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  topChipRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  topChip: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  topChipText: { color: colors.textPrimary, fontSize: 12, fontFamily: fonts.bodySemi },
  threadContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  bubbleRow: { maxWidth: "88%", flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  bubbleRowUser: { alignSelf: "flex-end" },
  bubbleRowAssistant: { alignSelf: "flex-start" },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.aiSurface,
    borderWidth: 1,
    borderColor: colors.aiBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubble: { flexShrink: 1, borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleUser: { backgroundColor: colors.accent },
  bubbleAssistant: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleTextUser: { color: colors.textOnAccent, fontSize: 15, lineHeight: 21 },
  bubbleTextAssistant: { color: colors.textPrimary, fontSize: 15, lineHeight: 21 },
  whyLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.xs, alignSelf: "flex-start" },
  whyText: { color: colors.aiAccent, fontSize: 12, fontFamily: fonts.bodySemi },
  timeLabel: { ...typography.meta, fontSize: 11, color: colors.textMuted, marginTop: 4 },
  quickScroll: { flexGrow: 0 },
  quickRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  quickChip: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  quickChipText: { fontSize: 12, fontFamily: fonts.bodySemi },
  disclaimer: {
    color: colors.textMuted,
    ...typography.meta,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  composerPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  composerIcon: { width: 32, height: 40, alignItems: "center", justifyContent: "center", opacity: 0.6 },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    color: colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: spacing.xs,
    paddingVertical: 10,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.5 },
  draftCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 10,
  },
  limitNotice: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.aiSurface,
    borderColor: colors.aiBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
