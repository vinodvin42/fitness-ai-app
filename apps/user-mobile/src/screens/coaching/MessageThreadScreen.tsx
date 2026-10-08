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
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CoachMessageItem } from "@fitness-ai-app/types";
import { ErrorState } from "../../components/ErrorState";
import { Button } from "../../components/Button";
import { fetchThread, sendMessage } from "../../api/coachMessages";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MessageThread">;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Message thread — consumer side (docs/coach/03-screen-inventory.md), added
 * 31 Aug 2026. The user IS the "user" sender, so their own messages align
 * right. Polls every 8s (no real-time delivery — see apps/api's
 * coachMessages.service.ts). Opening the thread marks the coach's messages
 * read server-side.
 */
export function MessageThreadScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { professionalId, fullName } = route.params;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-thread", professionalId],
    queryFn: () => fetchThread(professionalId),
    refetchInterval: 8_000,
  });

  const mutation = useMutation({
    mutationFn: () => sendMessage(professionalId, { content: draft.trim() }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["coach-thread", professionalId] });
      queryClient.invalidateQueries({ queryKey: ["coach-conversations"] });
    },
    onError: (err) => Alert.alert("Message not sent", extractErrorMessage(err, "Please try again.")),
  });

  const canSend = draft.trim().length > 0 && !mutation.isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm }}>
        <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontFamily: fonts.bodySemi }}>
          ‹ Back
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
                No messages yet. Start the conversation with {fullName.split(" ")[0]}.
              </Text>
            ) : (
              data.messages.map((m: CoachMessageItem) => <MessageBubble key={m.id} message={m} mine={m.sender === "user"} />)
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
            placeholder={t("coaching.messages.placeholder")}
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
            label={t("coaching.messages.send")}
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
      <Text style={{ color: mine ? "#FFFFFF" : colors.textPrimary }}>{message.content}</Text>
      <Text
        style={{
          color: mine ? "rgba(255,255,255,0.7)" : colors.textMuted,
          fontSize: 10,
          marginTop: 2,
          textAlign: "right",
        }}
      >
        {timeLabel(message.createdAt)}
      </Text>
    </View>
  );
}
