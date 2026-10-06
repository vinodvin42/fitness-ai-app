import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import { fetchCoachProfile } from "../../api/coaching";
import { professionalRoleLabel } from "../../lib/quoteFormat";
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

  // Role line (e.g. "Fitness Professional") from the real profile; absent while loading.
  const profile = useQuery({ queryKey: ["coaching", "professional", professionalId], queryFn: () => fetchCoachProfile(professionalId) });
  const role = profile.data ? professionalRoleLabel(profile.data.verifiedServices) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
        <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22 }}>
          Professional Messaging
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          marginHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="chevron-left" size={18} color={colors.textPrimary} />
        </Pressable>
        <Avatar name={fullName} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{fullName}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: fonts.body }}>
            {role ? `${role} · ` : ""}Response time is not guaranteed
          </Text>
        </View>
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
            alignItems: "center",
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor={colors.textMuted}
            multiline
            accessibilityLabel="Type a message"
            style={{
              flex: 1,
              color: colors.textPrimary,
              backgroundColor: colors.surfaceRaised,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: spacing.md,
              paddingVertical: 10,
              maxHeight: 120,
            }}
          />
          <Pressable
            onPress={() => mutation.mutate()}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: canSend ? 1 : 0.45,
            }}
          >
            {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Icon name="arrow-up" size={20} color="#fff" strokeWidth={2.5} />}
          </Pressable>
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
