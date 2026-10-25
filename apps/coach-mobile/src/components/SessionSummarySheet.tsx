import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookingSummary, CoachScheduleItem } from "@fitness-ai-app/types";
import { Button } from "./Button";
import { fetchBookingSummary, publishBookingSummary } from "../api/bookingSummaries";
import { extractErrorMessage } from "../lib/apiError";
import { colors, radius, spacing, typography } from "../theme/tokens";

/** Same cap as apps/api's coachSummaries.schema.ts publishSummarySchema. */
const SUMMARY_MAX_LENGTH = 4000;

const summaryKey = (bookingId: string) => ["coach-booking-summary", bookingId] as const;

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The API takes a summary only for a confirmed session that has started (coachSummaries.service.ts). */
export function canWriteSummary(item: CoachScheduleItem, now: number = Date.now()): boolean {
  return item.status === "confirmed" && new Date(item.scheduledAt).getTime() <= now;
}

/**
 * "Write summary" on a past session, or "Summary published" once this coach
 * has published one. The schedule row's hasSummary says so after a reload;
 * the sheet's own read of the summary, if it has run, is newer, so it wins.
 * The link only reads that cache and never fetches.
 */
export function SessionSummaryLink({ item, onPress }: { item: CoachScheduleItem; onPress: () => void }) {
  const { t } = useTranslation();
  const { data: cached } = useQuery({
    queryKey: summaryKey(item.id),
    queryFn: () => fetchBookingSummary(item.id),
    enabled: false,
  });
  const published = cached?.hasSummary ?? item.hasSummary;
  return (
    <Text
      onPress={onPress}
      accessibilityRole="button"
      style={{
        color: published ? colors.success : colors.accent,
        fontSize: 13,
        fontWeight: "600",
        marginTop: 4,
        alignSelf: "flex-start",
      }}
    >
      {published ? `✓ ${t("sessionSummary.published")}` : `${t("sessionSummary.write")} ›`}
    </Text>
  );
}

type Props = {
  /** The session being summarised; null keeps the sheet closed. */
  session: CoachScheduleItem | null;
  /** The client's name. Passed separately because Client Profile's schedule rows leave clientFullName empty. */
  clientName: string;
  onClose: () => void;
};

/**
 * Write and publish a session summary (25 Oct 2026), opened from a past
 * session on Calendar or Client Profile. It reads the summary back from GET
 * /professionals/me/bookings/:id/summary, so a published one shows with its
 * time after a reload. The coach can edit it and publish again, which
 * replaces it (POST on the same path). Errors are shown in the sheet rather
 * than in an Alert, which react-native-web can't display.
 */
export function SessionSummarySheet({ session, clientName, onClose }: Props) {
  return (
    <Modal visible={session != null} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        {session ? <SheetBody key={session.id} session={session} clientName={clientName} onClose={onClose} /> : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SheetBody({ session, clientName, onClose }: { session: CoachScheduleItem; clientName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: summaryKey(session.id), queryFn: () => fetchBookingSummary(session.id) });

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.card,
        borderTopRightRadius: radius.card,
        maxHeight: "90%",
      }}
    >
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "700" }}>
            {t("sessionSummary.title")}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("sessionSummary.close")} hitSlop={10}>
            <Text style={{ color: colors.textSecondary, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          {clientName} · {whenLabel(session.scheduledAt)} · {session.offeringLabel}
        </Text>

        {query.data ? (
          <SummaryContent
            session={session}
            clientName={clientName}
            published={query.data.hasSummary ? query.data : null}
            onClose={onClose}
          />
        ) : query.isError ? (
          <>
            <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>
              {t("sessionSummary.loadFailed")}: {extractErrorMessage(query.error, "Please try again.")}
            </Text>
            <Button label={t("common.retry")} variant="secondary" onPress={() => query.refetch()} />
          </>
        ) : (
          <ActivityIndicator color={colors.accent} accessibilityLabel={t("sessionSummary.loading")} style={{ marginVertical: spacing.lg }} />
        )}
      </ScrollView>
    </View>
  );
}

/** Mounted once the read has answered, so the editor starts open only when nothing is published yet. */
function SummaryContent({
  session,
  clientName,
  published,
  onClose,
}: {
  session: CoachScheduleItem;
  clientName: string;
  published: BookingSummary | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(!published);
  const [draft, setDraft] = useState(published?.summaryText ?? "");
  const firstName = clientName.split(" ")[0] || clientName;

  const mutation = useMutation({
    mutationFn: () => publishBookingSummary(session.id, { summaryText: draft.trim() }),
    onSuccess: (result) => {
      queryClient.setQueryData(summaryKey(session.id), result);
      // Calendar and Client Profile rows carry hasSummary; refresh them so they agree after this.
      void queryClient.invalidateQueries({ queryKey: ["coach-schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["coach-client"] });
      setEditing(false);
    },
  });

  const canPublish = draft.trim().length > 0 && !mutation.isPending;

  if (editing || !published) {
    return (
      <>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t("sessionSummary.intro", { name: firstName })}</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t("sessionSummary.placeholder")}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={SUMMARY_MAX_LENGTH}
          accessibilityLabel={t("sessionSummary.inputLabel")}
          style={{
            minHeight: 160,
            color: colors.textPrimary,
            backgroundColor: colors.background,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.sm,
            fontSize: 15,
            textAlignVertical: "top",
          }}
        />
        <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: "right" }}>
          {draft.length}/{SUMMARY_MAX_LENGTH}
        </Text>
        {published ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("sessionSummary.replaceNote", { name: firstName })}</Text>
        ) : null}
        {mutation.isError ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>
            {t("sessionSummary.failed")}: {extractErrorMessage(mutation.error, "Please try again.")}
          </Text>
        ) : null}
        <Button label={t("sessionSummary.publish")} onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={!canPublish} />
        {published ? <Button label={t("common.cancel")} variant="secondary" onPress={() => setEditing(false)} /> : null}
      </>
    );
  }

  return (
    <>
      {published.summaryPublishedAt ? (
        <Text style={{ color: colors.success, fontSize: 13, fontWeight: "600" }}>
          {t("sessionSummary.publishedAt", { when: whenLabel(published.summaryPublishedAt) })}
        </Text>
      ) : null}
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: 15,
          lineHeight: 22,
          padding: spacing.sm,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceRaised,
        }}
      >
        {published.summaryText}
      </Text>
      <Button
        label={t("sessionSummary.edit")}
        variant="secondary"
        onPress={() => {
          setDraft(published.summaryText ?? "");
          mutation.reset();
          setEditing(true);
        }}
      />
      <Button label={t("sessionSummary.done")} onPress={onClose} />
    </>
  );
}
