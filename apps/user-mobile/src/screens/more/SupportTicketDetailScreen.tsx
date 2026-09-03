import React, { useState } from "react";
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
import type { SupportTicketMessage } from "@fitness-ai-app/types";
import { ErrorState } from "../../components/ErrorState";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { fetchTicketDetail, sendTicketMessage } from "../../api/support";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_TONE } from "./SupportScreen";

type Props = NativeStackScreenProps<MoreStackParamList, "SupportTicketDetail">;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Support Ticket Detail (docs/mobile/03-screen-inventory.md §L), added
 * 3 Sep 2026 — closes gap §19's remaining "no message thread" note.
 * Reachable by tapping a row on SupportScreen.tsx's "My Tickets" list.
 * Shows the ticket's original submission plus the full
 * `SupportTicketMessage` thread, and lets the ticket's own owner reply —
 * the backend 404s this screen's fetch/reply for any ticket that isn't
 * this user's own (see apps/api's support.service.ts, getMyTicketOrThrow).
 *
 * Closely mirrors the coaching Message Thread screen
 * (screens/coaching/MessageThreadScreen.tsx): polls every 8s (no real-time
 * delivery — this build has no websocket/push infrastructure anywhere),
 * and the viewer's own messages align right in the accent color while the
 * other side's align left on a plain surface. Here "mine" is always
 * `sender === "user"` (including the ticket's original submission, always
 * shown first) since only the ticket's own owner can ever reach this
 * screen; the other side is always an admin reply.
 */
export function SupportTicketDetailScreen({ route, navigation }: Props) {
  const { ticketId } = route.params;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["support-ticket-detail", ticketId],
    queryFn: () => fetchTicketDetail(ticketId),
    refetchInterval: 8_000,
  });

  const mutation = useMutation({
    mutationFn: () => sendTicketMessage(ticketId, { body: draft.trim() }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["support-ticket-detail", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
    },
    onError: (err) => Alert.alert("Message not sent", extractErrorMessage(err, "Please try again.")),
  });

  const canSend = draft.trim().length > 0 && !mutation.isPending;
  const ticket = data?.ticket;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm }}>
        <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontFamily: fonts.bodySemi }}>
          ‹ Back
        </Text>
        {ticket && (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: spacing.xs,
              }}
            >
              <Text
                numberOfLines={2}
                style={{ color: colors.textPrimary, ...typography.h1, flex: 1, marginRight: spacing.sm }}
              >
                {ticket.subject}
              </Text>
              <Pill label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />
            </View>
            <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
              {CATEGORY_LABEL[ticket.category]} · Opened {new Date(ticket.createdAt).toLocaleDateString()}
            </Text>
          </>
        )}
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
            {/* The ticket's original submission always leads the thread — it's
                the same `message` field SupportScreen.tsx has always shown,
                now rendered as the first bubble instead of a separate block. */}
            <MessageBubble body={data.ticket.message} createdAt={data.ticket.createdAt} mine />
            {data.messages.map((m: SupportTicketMessage) => (
              <MessageBubble key={m.id} body={m.body} createdAt={m.createdAt} mine={m.sender === "user"} />
            ))}
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
            placeholder="Reply…"
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
            label="Send"
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

function MessageBubble({ body, createdAt, mine }: { body: string; createdAt: string; mine: boolean }) {
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
      <Text style={{ color: mine ? colors.textOnAccent : colors.textPrimary }}>{body}</Text>
      <Text
        style={{
          color: mine ? "rgba(4,18,14,0.6)" : colors.textMuted,
          fontSize: 10,
          marginTop: 2,
          textAlign: "right",
        }}
      >
        {timeLabel(createdAt)}
      </Text>
    </View>
  );
}
