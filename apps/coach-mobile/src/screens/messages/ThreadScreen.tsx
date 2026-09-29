import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { CoachMessageItem } from "@fitness-ai-app/types";
import { ErrorState } from "../../components/ErrorState";
import { Button } from "../../components/Button";
import { fetchThread, sendMessage } from "../../api/coachMessages";
import { extractErrorMessage } from "../../lib/apiError";
import type { MessagesStackParamList } from "../../navigation/MessagesStack";
import { colors, radius, spacing, typography } from "../../theme/tokens";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Message thread — coach side (docs/coach/03-screen-inventory.md), added 31
 * Aug 2026. The coach IS the "professional" sender, so their own messages
 * align right. Polls every 8s (no real-time delivery in this build — see
 * apps/api's coachMessages.service.ts). Opening the thread marks the
 * client's messages read server-side, so the conversation list's unread
 * badge clears on next refetch.
 */
export function ThreadScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MessagesStackParamList, "Thread">>();
  const { userId, fullName } = route.params;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-thread", userId],
    queryFn: () => fetchThread(userId),
    refetchInterval: 8_000,
  });

  const mutation = useMutation({
    mutationFn: () => sendMessage(userId, { content: draft.trim() }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["coach-thread", userId] });
      queryClient.invalidateQueries({ queryKey: ["coach-conversations"] });
    },
    onError: (err) => Alert.alert("Message not sent", extractErrorMessage(err, "Please try again.")),
  });

  const canSend = draft.trim().length > 0 && !mutation.isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm }}>
        <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
          ‹ Messages
        </Text>
        <Text style={{ color: colors.textPrimary, ...typography.h1, marginTop: spacing.xs }}>{fullName}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        {isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
        {isError && <ErrorState onRetry={() => refetch()} />}

        {data && (
          <ScrollView
            contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1, justifyContent: "flex-end" }}
          >
            {data.messages.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                No messages yet. Say hello to {fullName.split(" ")[0]}.
              </Text>
            ) : (
              data.messages.map((m: CoachMessageItem) => <MessageBubble key={m.id} message={m} mine={m.sender === "professional"} />)
            )}
          </ScrollView>
        )}

        <View
          style={{
            flexDirection: "row",
            gap: spacing.sm,
            padding: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            alignItems: "flex-end",
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t("messages.placeholder")}
            placeholderTextColor={colors.textMuted}
            multiline
            style={{
              flex: 1,
              color: colors.textPrimary,
              backgroundColor: colors.surface,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.sm,
              maxHeight: 120,
            }}
          />
          <Button
            label={t("common.send")}
            onPress={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canSend}
            style={{ height: 44, paddingHorizontal: spacing.md }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message, mine }: { message: CoachMessageItem; mine: boolean }) {
  return (
    <View
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "80%",
        backgroundColor: mine ? colors.accent : colors.surface,
        borderRadius: radius.card,
        borderWidth: mine ? 0 : 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: mine ? "#0B0B0F" : colors.textPrimary }}>{message.content}</Text>
      <Text style={{ color: mine ? "rgba(11,11,15,0.6)" : colors.textMuted, fontSize: 10, marginTop: 2, textAlign: "right" }}>
        {timeLabel(message.createdAt)}
      </Text>
    </View>
  );
}
