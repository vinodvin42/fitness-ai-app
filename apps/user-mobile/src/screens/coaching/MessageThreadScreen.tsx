import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
import type { CoachMessageItem, SafetyReportReason } from "@fitness-ai-app/types";
import { ErrorState } from "../../components/ErrorState";
import { Avatar } from "../../components/Avatar";
import { HeaderIconButton } from "../../components/HeaderIconButton";
import { fetchRelationshipStatus } from "../../api/coaching";
import { Button } from "../../components/Button";
import { fetchThread, reportCoach, sendMessage, setCoachBlocked } from "../../api/coachMessages";
import { ReportSheet } from "../../components/ReportSheet";
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
 *
 * Safety (Oct 2026; app-store rules for apps where people message each
 * other): "⋯" reports the coach or blocks them; a long press on one of the
 * coach's messages reports that message. While either side has blocked, the
 * composer is replaced by a short explanation. Messages Fynrox removed after a
 * report show as "Removed by Fynrox".
 */
export function MessageThreadScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { professionalId, fullName } = route.params;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState<{ messageId?: string } | null>(null);

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

  // Figma coach/03 header: what this professional does for the member.
  const status = useQuery({ queryKey: ["coaching", "relationships", "status"], queryFn: fetchRelationshipStatus });
  const services = (status.data?.relationships ?? []).filter((r) => r.professionalId === professionalId && r.status === "active").map((r) => r.serviceType);
  const role =
    services.includes("fitness") && services.includes("nutrition")
      ? "Fitness & Nutrition Professional"
      : services[0] === "nutrition"
        ? "Nutrition Professional"
        : services[0] === "fitness"
          ? "Fitness Professional"
          : "Professional";

  const canSend = draft.trim().length > 0 && !mutation.isPending;
  const blocked = data?.blocked;
  const isBlocked = Boolean(blocked?.byMe || blocked?.byThem);

  const reportMutation = useMutation({
    mutationFn: (input: { reason: SafetyReportReason; details: string; messageId?: string }) =>
      reportCoach(professionalId, { reason: input.reason, details: input.details || undefined, messageId: input.messageId }),
    onSuccess: () => {
      setReporting(null);
      Alert.alert("Report sent", "Thanks for telling us. Fynrox's safety team will review it.");
    },
    onError: (err) => Alert.alert("Report not sent", extractErrorMessage(err, "Please try again.")),
  });

  const blockMutation = useMutation({
    mutationFn: (block: boolean) => setCoachBlocked(professionalId, block),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coach-thread", professionalId] }),
    onError: (err) => Alert.alert("That didn't work", extractErrorMessage(err, "Please try again.")),
  });

  const openMenu = () => {
    Alert.alert(fullName, undefined, [
      { text: `Report ${fullName.split(" ")[0]}`, onPress: () => setReporting({}) },
      blocked?.byMe
        ? { text: "Unblock", onPress: () => blockMutation.mutate(false) }
        : {
            text: "Block",
            style: "destructive",
            onPress: () =>
              Alert.alert(
                `Block ${fullName.split(" ")[0]}?`,
                `Neither of you will be able to send messages here. This doesn't end your coaching: ${fullName.split(" ")[0]} can still see what you share with them. To stop, send a change request from My coaches and the Fynrox team will review it.`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Block", style: "destructive", onPress: () => blockMutation.mutate(true) },
                ],
              ),
          },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const onLongPressMessage = (m: CoachMessageItem) => {
    if (m.sender === "user" || m.removed) return;
    Alert.alert("Report this message?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Report", onPress: () => setReporting({ messageId: m.id }) },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <HeaderIconButton icon="chevron-left" label="Back" onPress={() => navigation.goBack()} />
          <Text accessibilityRole="header" style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18 }}>
            Professional Messaging
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Avatar name={fullName} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 16 }} numberOfLines={1}>
              {fullName}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
              {role}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Response time is not guaranteed</Text>
          </View>
          <Pressable
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel={`More options for ${fullName}: report or block`}
            hitSlop={8}
            style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 20 }}>⋯</Text>
          </Pressable>
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
              data.messages.map((m: CoachMessageItem) => (
                <MessageBubble key={m.id} message={m} mine={m.sender === "user"} onLongPress={() => onLongPressMessage(m)} />
              ))
            )}
          </ScrollView>
        )}

        {isBlocked ? (
          <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.xs }}>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>
              {blocked?.byMe
                ? `You blocked ${fullName.split(" ")[0]}. Messages are off in this conversation.`
                : "Messages are off in this conversation."}
            </Text>
            {blocked?.byMe && (
              <Text
                onPress={() => blockMutation.mutate(false)}
                accessibilityRole="button"
                style={{ color: colors.accentText, fontFamily: fonts.bodySemi, paddingVertical: spacing.xs }}
              >
                Unblock
              </Text>
            )}
          </View>
        ) : (
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
        )}
      </KeyboardAvoidingView>

      <ReportSheet
        visible={reporting !== null}
        subject={reporting?.messageId ? "this message" : fullName.split(" ")[0]}
        submitting={reportMutation.isPending}
        onClose={() => setReporting(null)}
        onSubmit={(reason, details) => reportMutation.mutate({ reason, details, messageId: reporting?.messageId })}
      />
    </SafeAreaView>
  );
}

function MessageBubble({ message, mine, onLongPress }: { message: CoachMessageItem; mine: boolean; onLongPress: () => void }) {
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityHint={mine || message.removed ? undefined : "Long press to report this message"}
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
      <Text style={{ color: mine ? "#FFFFFF" : message.removed ? colors.textMuted : colors.textPrimary, fontStyle: message.removed ? "italic" : "normal" }}>
        {message.content}
      </Text>
      <Text
        style={{
          color: mine ? "rgba(255,255,255,0.7)" : colors.textMuted,
          fontSize: 13,
          marginTop: 2,
          textAlign: "right",
        }}
      >
        {timeLabel(message.createdAt)}
      </Text>
    </Pressable>
  );
}
