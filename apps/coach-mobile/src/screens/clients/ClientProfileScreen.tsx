import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type {
  AvailableProfessional,
  CoachClientProfile,
  CoachClientSummary,
  CoachClientSummaryBodyMeasurement,
  CoachClientSummaryCheckIn,
  CoachClientSummaryMealLog,
  CoachClientSummaryWorkoutSession,
  CoachNote,
  CoachScheduleItem,
} from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchClientProfile, fetchClientSummary } from "../../api/professionalClients";
import { createClientNote, deleteClientNote, fetchClientNotes, updateClientNote } from "../../api/coachNotes";
import { flagClientSafety } from "../../api/professionalClients";
import {
  completeRelationship,
  endRelationship,
  fetchAvailableProfessionalsForHandover,
  handoverRelationship,
} from "../../api/relationshipLifecycle";
import { extractErrorMessage } from "../../lib/apiError";
import type { ClientsStackParamList } from "../../navigation/ClientsStack";
import { colors, radius, spacing, typography } from "../../theme/tokens";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };
const LEVEL_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function sessionLine(item: CoachScheduleItem): string {
  const when = new Date(item.scheduledAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const svc = item.serviceType ? ` · ${SERVICE_LABELS[item.serviceType] ?? item.serviceType}` : "";
  return `${when} · ${item.offeringLabel}${svc}`;
}

/**
 * Client Profile detail (docs/coach/03-screen-inventory.md §D), added 31 Aug
 * 2026. Real coaching-relevant onboarding fields (goals, training level,
 * diet) plus real session history from `Booking`. Onboarding's own
 * sensitive fields (age/weight/height/medical/injuries) stay withheld
 * behind an honest "not available" card — see
 * apps/api's professionalClients.service.ts doc comment for why (Module
 * 02's `SensitiveDataAccessRequest`-style boundary, not a coach-facing flow).
 *
 * **Wave 2 (20 Sep 2026): Client 360 added.** `ClientSummarySection` below
 * now surfaces real Training/Nutrition/Check-ins/Body-measurement
 * summaries from GET /professionals/me/clients/:userId/summary — but ONLY
 * once the client has granted `health_data_processing` Consent, checked
 * server-side (see professionalClients.service.ts's getClientSummary).
 * `consentGranted: false` renders a real, honest "hasn't enabled data
 * sharing yet" card instead of a blank/broken-looking section.
 *
 * **Wave 3 (20 Sep 2026, R1 U6): `RelationshipActionsSection` added** — the
 * real professional-initiated "End Relationship" / "Handover to Another
 * Coach" actions this build never had (a dedicated audit confirmed no
 * such flow existed anywhere), backed by apps/api's
 * relationshipLifecycle.service.ts. A plain required-reason text field
 * (this app has no shared reason-gated-action component like admin-web's
 * `ReasonGatedAction` — see that file's own doc comment for why this build
 * doesn't share one across apps) plus a native `Alert.alert` confirmation,
 * same "confirm via Alert" precedent PendingRequestsScreen.tsx's own
 * `confirmDecline`/`confirmDeclineOffer` already use for a destructive
 * action. Handover's replacement-professional picker reuses
 * `fetchAvailableProfessionalsForHandover` (professionalOffers.service.ts's
 * own `listAvailableProfessionals`, minus this coach's own id) — the same
 * real "available for new clients" list admin-web's Propose Professional
 * dropdown already established, not a second invented pattern.
 */
export function ClientProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ClientsStackParamList, "ClientProfile">>();
  const route = useRoute<RouteProp<ClientsStackParamList, "ClientProfile">>();
  const { userId, fullName } = route.params;
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-client", userId],
    queryFn: () => fetchClientProfile(userId),
  });

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["coach-client-summary", userId],
    queryFn: () => fetchClientSummary(userId),
  });

  // Once a relationship-ending action succeeds, this client may no longer
  // be an active client of this coach's at all (getClientProfile's own
  // authorization gate is "an active Relationship exists") — rather than
  // leave the screen showing stale data or a confusing 404, this returns
  // straight to the Clients list, same as PendingRequestsScreen.tsx's own
  // "action, then leave the now-irrelevant screen" precedent.
  const onRelationshipEnded = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ["coach-clients"] });
    Alert.alert("Done", message, [{ text: "OK", onPress: () => navigation.goBack() }]);
  };

  return (
    <ScreenContainer title={fullName}>
      <Text
        onPress={() => navigation.goBack()}
        style={{ color: colors.accent, fontWeight: "600", marginBottom: spacing.xs }}
      >
        ‹ Clients
      </Text>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && (
        <>
          <ClientProfileBody profile={data} />
          <Button
            label={t("clients.recommendations.review")}
            variant="secondary"
            onPress={() => navigation.navigate("ClientRecommendations", { userId, fullName })}
          />
          <RelationshipActionsSection relationships={data.relationships} onComplete={onRelationshipEnded} />
        </>
      )}

      {isSummaryLoading && <ActivityIndicator color={colors.accent} />}
      {isSummaryError && <ErrorState onRetry={() => refetchSummary()} message={t("clients.profile.activityError")} />}
      {summary && <ClientSummarySection summary={summary} />}

      {/* P-M12 — above private notes on purpose: a note is for the
          coach, a flag is for the safety team, and a coach reaching
          for somewhere to record a worry should meet the escalation
          route first. */}
      <SafetyFlagCard userId={userId} fullName={fullName} />
      <NotesSection userId={userId} />
    </ScreenContainer>
  );
}

/**
 * P-M11 (28 Sep 2026) — `complete` joins the two existing outcomes.
 * §10 makes COMPLETED distinct from ENDED: ending says the arrangement
 * stopped, completing says the work finished. Both revoke access, but
 * only one is something to be pleased about, and collapsing them denies
 * a coach and their client that difference — "Complete programme" had
 * no destination before this.
 */
type RelationshipMode = "end" | "handover" | "complete";

/**
 * See this screen's own top comment (Wave 3, R1 U6) for the full design.
 * One relationship row at a time can have its form open
 * (`openRelationshipId`) — a client with both a fitness and a nutrition
 * relationship gets two independent rows, since ending one must never
 * imply ending the other (schema.prisma's own `@@unique([userId,
 * professionalId, serviceType])` comment already treats these as separate
 * pairings).
 */
function RelationshipActionsSection({
  relationships,
  onComplete,
}: {
  relationships: CoachClientProfile["relationships"];
  onComplete: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [openRelationshipId, setOpenRelationshipId] = useState<string | null>(null);
  const [mode, setMode] = useState<RelationshipMode>("end");
  const [reason, setReason] = useState("");
  const [replacementSearch, setReplacementSearch] = useState("");
  const [replacementId, setReplacementId] = useState<string | null>(null);

  const availableProfessionalsQuery = useQuery({
    queryKey: ["coach-available-professionals-for-handover", replacementSearch],
    queryFn: () => fetchAvailableProfessionalsForHandover(replacementSearch || undefined),
    enabled: openRelationshipId != null && mode === "handover",
  });

  const resetForm = () => {
    setOpenRelationshipId(null);
    setReason("");
    setReplacementSearch("");
    setReplacementId(null);
  };

  const endMutation = useMutation({
    mutationFn: (relationshipId: string) => endRelationship(relationshipId, { reason: reason.trim() }),
    onSuccess: () => {
      resetForm();
      onComplete("This relationship has ended.");
    },
    onError: (err) => Alert.alert("Couldn't end this relationship", extractErrorMessage(err, "Please try again.")),
  });

  const completeMutation = useMutation({
    mutationFn: (relationshipId: string) => completeRelationship(relationshipId, reason.trim()),
    onSuccess: () => {
      resetForm();
      onComplete("Programme marked complete. This client's access has ended.");
    },
    onError: (err) =>
      Alert.alert("Couldn't complete this programme", extractErrorMessage(err, "Please try again.")),
  });

  const handoverMutation = useMutation({
    mutationFn: (relationshipId: string) =>
      handoverRelationship(relationshipId, {
        reason: reason.trim(),
        replacementProfessionalId: replacementId ?? undefined,
      }),
    onSuccess: (result) => {
      resetForm();
      onComplete(
        result.offer
          ? "This relationship has ended and the replacement coach has been sent an offer for this client."
          : "This relationship has ended.",
      );
    },
    onError: (err) => Alert.alert("Couldn't complete the handover", extractErrorMessage(err, "Please try again.")),
  });

  const openForm = (relationshipId: string, nextMode: RelationshipMode) => {
    resetForm();
    setOpenRelationshipId(relationshipId);
    setMode(nextMode);
  };

  const confirmSubmit = (relationshipId: string) => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length === 0) return;

    const isHandoverWithReplacement = mode === "handover" && replacementId != null;
    Alert.alert(
      mode === "handover"
        ? "Confirm handover"
        : mode === "complete"
          ? "Confirm programme complete"
          : "Confirm end relationship",
      isHandoverWithReplacement
        ? "This ends your relationship with this client and sends the replacement coach a real offer for them. This can't be undone from here."
        : mode === "complete"
          ? "This marks the programme finished and ends your access to this client's data. They'll see a completion summary. This can't be undone from here."
          : "This ends your relationship with this client. This can't be undone from here.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: mode === "handover" ? "Hand Over" : mode === "complete" ? "Complete" : "End Relationship",
          // Completing is not destructive in the way the other two are —
          // it is the good ending, and styling it red would tell a coach
          // finishing a programme well that they are doing damage.
          style: mode === "complete" ? "default" : "destructive",
          onPress: () =>
            mode === "handover"
              ? handoverMutation.mutate(relationshipId)
              : mode === "complete"
                ? completeMutation.mutate(relationshipId)
                : endMutation.mutate(relationshipId),
        },
      ],
    );
  };

  if (relationships.length === 0) return null;

  return (
    <Card>
      <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Relationship</Text>
      {relationships.map((r) => {
        const isOpen = openRelationshipId === r.relationshipId;
        const isBusy =
          (endMutation.isPending && endMutation.variables === r.relationshipId) ||
          (handoverMutation.isPending && handoverMutation.variables === r.relationshipId) ||
          (completeMutation.isPending && completeMutation.variables === r.relationshipId);

        return (
          <View key={r.relationshipId} style={{ marginBottom: spacing.md }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: spacing.xs }}>
              {SERVICE_LABELS[r.serviceType] ?? r.serviceType}
            </Text>

            {!isOpen ? (
              <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
                {/* Listed first because finishing a programme is the
                    outcome everyone wants, and burying it behind the two
                    ways things go wrong makes it look like the exception. */}
                <Button
                  label={t("clients.profile.completeProgramme")}
                  onPress={() => openForm(r.relationshipId, "complete")}
                  style={{ flex: 1 }}
                />
                <Button
                  label={t("clients.profile.endRelationship")}
                  variant="secondary"
                  onPress={() => openForm(r.relationshipId, "end")}
                  style={{ flex: 1 }}
                />
                <Button
                  label={t("clients.profile.handover")}
                  variant="secondary"
                  onPress={() => openForm(r.relationshipId, "handover")}
                  style={{ flex: 1 }}
                />
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                <TextInput
                  placeholder={t("clients.profile.reasonRequired")}
                  placeholderTextColor={colors.textMuted}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  style={{
                    minHeight: 52,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    color: colors.textPrimary,
                  }}
                />

                {mode === "handover" && (
                  <View>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: spacing.xs }}>
                      {t("clients.profile.proposeReplacement")}
                    </Text>
                    <TextInput
                      placeholder={t("clients.profile.searchProfessionals")}
                      placeholderTextColor={colors.textMuted}
                      value={replacementSearch}
                      onChangeText={setReplacementSearch}
                      style={{
                        height: 44,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        paddingHorizontal: spacing.md,
                        color: colors.textPrimary,
                        marginBottom: spacing.xs,
                      }}
                    />
                    {availableProfessionalsQuery.isLoading && <ActivityIndicator color={colors.accent} />}
                    {(availableProfessionalsQuery.data?.professionals ?? []).map((p: AvailableProfessional) => {
                      const selected = p.id === replacementId;
                      return (
                        <Text
                          key={p.id}
                          onPress={() => setReplacementId(selected ? null : p.id)}
                          style={{
                            color: selected ? colors.accent : colors.textPrimary,
                            fontWeight: selected ? "700" : "400",
                            paddingVertical: 6,
                          }}
                        >
                          {selected ? "✓ " : ""}
                          {p.fullName}
                          {p.yearsExperience != null ? ` · ${p.yearsExperience}y exp` : ""}
                        </Text>
                      );
                    })}
                    {availableProfessionalsQuery.data?.professionals.length === 0 && (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {t("clients.profile.noProfessionalsAvailable")}
                      </Text>
                    )}
                  </View>
                )}

                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Button
                    label={mode === "handover" ? "Hand Over" : "End Relationship"}
                    onPress={() => confirmSubmit(r.relationshipId)}
                    disabled={reason.trim().length === 0 || isBusy}
                    loading={isBusy}
                    style={{ flex: 1 }}
                  />
                  <Button label={t("common.cancel")} variant="secondary" onPress={resetForm} style={{ flex: 1 }} disabled={isBusy} />
                </View>
              </View>
            )}
          </View>
        );
      })}
    </Card>
  );
}

/**
 * P-M12 — "Client safety flag + escalation route. Pain is handled only
 * inside chat."
 *
 * DESIGN-PENDING P-M12.
 *
 * A coach noticing something concerning — a client reporting chest pain
 * mid-session, a pattern that reads as disordered eating — had nowhere
 * to put it except a chat message, which nobody monitors and which is
 * not an escalation. This is that route, and it is deliberately
 * separate from private notes: a note is for the coach, a flag is for
 * the safety team.
 *
 * The urgent toggle raises queue severity. It does NOT page anyone, and
 * the screen says so — a coach who believes they have summoned help
 * when they have queued a ticket is worse off than one who knows to
 * call emergency services.
 */
function SafetyFlagCard({ userId, fullName }: { userId: string; fullName: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [concern, setConcern] = useState("");
  const [urgent, setUrgent] = useState(false);

  const raise = useMutation({
    mutationFn: () => flagClientSafety(userId, { concern: concern.trim(), urgent }),
    onSuccess: () => {
      setOpen(false);
      setConcern("");
      setUrgent(false);
      Alert.alert(
        "Flag raised",
        "Our safety team has been notified and will review this. You'll be contacted if they need anything from you.",
      );
    },
    onError: (err) => Alert.alert("Couldn't raise the flag", extractErrorMessage(err, "Please try again.")),
  });

  return (
    <Card>
      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Safety</Text>
      {!open ? (
        <>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
            Worried about {fullName.split(" ")[0]}'s safety or wellbeing? Raise it here rather than in chat — chat
            isn't monitored.
          </Text>
          <Button
            label={t("clients.profile.raiseSafety")}
            variant="secondary"
            onPress={() => setOpen(true)}
            style={{ marginTop: spacing.md }}
          />
        </>
      ) : (
        <View style={{ marginTop: spacing.sm }}>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>
            {t("clients.profile.safetyPrompt")}
          </Text>
          <TextInput
            value={concern}
            onChangeText={setConcern}
            multiline
            numberOfLines={4}
            maxLength={2000}
            placeholder={t("clients.profile.safetyPlaceholder")}
            placeholderTextColor={colors.textMuted}
            style={{
              color: colors.textPrimary,
              backgroundColor: colors.surfaceRaised,
              borderRadius: radius.card,
              padding: spacing.md,
              marginTop: spacing.xs,
              minHeight: 96,
              textAlignVertical: "top",
            }}
          />

          <Text
            onPress={() => setUrgent((u) => !u)}
            style={{ color: urgent ? colors.warning : colors.textSecondary, marginTop: spacing.md }}
          >
            {urgent ? "☑" : "☐"}  This needs attention today
          </Text>
          {/* Stated plainly. A coach who thinks they have summoned help
              when they have queued a ticket is worse off than one who
              knows to call emergency services. */}
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
            This raises the priority of the review. It does not alert anyone immediately. If someone is in immediate
            danger, call emergency services.
          </Text>

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <Button
              label={t("clients.profile.raiseFlag")}
              onPress={() => raise.mutate()}
              loading={raise.isPending}
              disabled={concern.trim().length < 10}
              style={{ flex: 1 }}
            />
            <Button
              label={t("common.cancel")}
              variant="secondary"
              onPress={() => {
                setOpen(false);
                setConcern("");
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

/**
 * Coach Private Notes (R2 Wave 3, 20 Sep 2026) — a coach's own private,
 * plain-text observations about this client, never shown to the client
 * themselves. See apps/api's coachNotes.service.ts doc comment for the
 * active-vs-any-relationship gate (creating a note needs an active
 * relationship; reading a coach's own past notes doesn't) and the
 * cross-coach isolation (only the note's own author can edit/delete it —
 * this screen never shows another coach's notes about a shared client,
 * since the list endpoint itself is scoped to the calling coach).
 */
function NotesSection({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const { data: notes, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-client-notes", userId],
    queryFn: () => fetchClientNotes(userId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["coach-client-notes", userId] });

  const createMutation = useMutation({
    mutationFn: () => createClientNote(userId, { body: draft.trim() }),
    onSuccess: () => {
      setDraft("");
      invalidate();
    },
    onError: (err) => Alert.alert("Note not saved", extractErrorMessage(err, "Please try again.")),
  });

  const updateMutation = useMutation({
    mutationFn: (noteId: string) => updateClientNote(userId, noteId, { body: editDraft.trim() }),
    onSuccess: () => {
      setEditingId(null);
      setEditDraft("");
      invalidate();
    },
    onError: (err) => Alert.alert("Note not updated", extractErrorMessage(err, "Please try again.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => deleteClientNote(userId, noteId),
    onSuccess: invalidate,
    onError: (err) => Alert.alert("Note not deleted", extractErrorMessage(err, "Please try again.")),
  });

  function confirmDelete(noteId: string) {
    Alert.alert("Delete note?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(noteId) },
    ]);
  }

  function startEdit(note: CoachNote) {
    setEditingId(note.id);
    setEditDraft(note.body);
  }

  return (
    <Card>
      <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.xs }}>{t("clients.profile.privateNotes")}</Text>
      <Text style={{ color: colors.textMuted, ...typography.meta, marginBottom: spacing.sm }}>
        {t("clients.profile.notesPrivate")}
      </Text>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} message={t("clients.profile.notesError")} />}

      {notes && notes.length === 0 && (
        <Text style={{ color: colors.textMuted, marginBottom: spacing.sm }}>{t("clients.profile.noNotes")}</Text>
      )}

      {notes &&
        notes.map((note) =>
          editingId === note.id ? (
            <View key={note.id} style={{ marginBottom: spacing.sm }}>
              <TextInput
                value={editDraft}
                onChangeText={setEditDraft}
                multiline
                autoFocus
                style={{
                  color: colors.textPrimary,
                  backgroundColor: colors.surface,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.sm,
                  marginBottom: spacing.xs,
                }}
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button
                  label={t("common.save")}
                  onPress={() => updateMutation.mutate(note.id)}
                  loading={updateMutation.isPending}
                  disabled={editDraft.trim().length === 0}
                  style={{ flex: 1 }}
                />
                <Button
                  label={t("common.cancel")}
                  variant="secondary"
                  onPress={() => {
                    setEditingId(null);
                    setEditDraft("");
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <View
              key={note.id}
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: spacing.sm,
                paddingBottom: spacing.sm,
              }}
            >
              <Text style={{ color: colors.textPrimary }}>{note.body}</Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: spacing.xs,
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {new Date(note.updatedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <Text onPress={() => startEdit(note)} style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
                    Edit
                  </Text>
                  <Text
                    onPress={() => confirmDelete(note.id)}
                    style={{ color: colors.danger, fontSize: 12, fontWeight: "600" }}
                  >
                    Delete
                  </Text>
                </View>
              </View>
            </View>
          ),
        )}

      <View style={{ marginTop: spacing.sm }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t("clients.profile.notePlaceholder")}
          placeholderTextColor={colors.textMuted}
          multiline
          style={{
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.sm,
            marginBottom: spacing.xs,
            minHeight: 44,
          }}
        />
        <Button
          label={t("clients.profile.saveNote")}
          onPress={() => createMutation.mutate()}
          loading={createMutation.isPending}
          disabled={draft.trim().length === 0}
        />
      </View>
    </Card>
  );
}

/**
 * Client 360 (Wave 2, 20 Sep 2026) — real Assessment/Training/Nutrition/
 * Check-in sections, sourced from GET /professionals/me/clients/:userId/summary.
 * Gated server-side on the client's own `health_data_processing` Consent —
 * `consentGranted: false` renders a clear, honest, non-alarming message
 * rather than a broken-looking empty state. See
 * apps/api's professionalClients.service.ts's getClientSummary doc comment.
 */
function ClientSummarySection({ summary }: { summary: CoachClientSummary }) {
  const { t } = useTranslation();
  if (!summary.consentGranted) {
    return (
      <Card style={{ borderStyle: "dashed" }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.xs }}>{t("clients.profile.activity")}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          This client hasn&apos;t enabled data sharing with their coach yet, so training, nutrition, and check-in
          activity aren&apos;t shown here. They can turn this on anytime from their own Privacy settings.
        </Text>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Training</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>
          {summary.training.completedCount} of {summary.training.totalCount} recent sessions completed
        </Text>
        {summary.training.recentSessions.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>{t("clients.profile.noWorkouts")}</Text>
        ) : (
          summary.training.recentSessions.map((s) => <WorkoutSessionRow key={s.id} session={s} />)
        )}
      </Card>

      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Nutrition</Text>
        {summary.nutrition.recentLogs.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>{t("clients.profile.noMeals")}</Text>
        ) : (
          summary.nutrition.recentLogs.map((m) => <MealLogRow key={m.id} log={m} />)
        )}
      </Card>

      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Check-ins</Text>
        {summary.checkIns.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>{t("clients.profile.noCheckIns")}</Text>
        ) : (
          summary.checkIns.map((c) => <CheckInRow key={c.id} checkIn={c} />)
        )}
      </Card>

      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("clients.profile.measurements")}</Text>
        {summary.bodyMeasurements.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>{t("clients.profile.noMeasurements")}</Text>
        ) : (
          summary.bodyMeasurements.map((b) => <BodyMeasurementRow key={b.id} measurement={b} />)
        )}
      </Card>

      {summary.notAvailable.length > 0 && (
        <Card style={{ borderStyle: "dashed" }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("clients.profile.notAvailable")}
          </Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
            {t("clients.profile.mediaWithheld")}
          </Text>
        </Card>
      )}
    </>
  );
}

function WorkoutSessionRow({ session }: { session: CoachClientSummaryWorkoutSession }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textPrimary, flexShrink: 1 }}>{session.workoutName ?? "Workout"}</Text>
      <Text style={{ color: session.status === "completed" ? colors.textSecondary : colors.textMuted, fontSize: 12 }}>
        {session.status} · {dateLabel(session.startedAt)}
      </Text>
    </View>
  );
}

function MealLogRow({ log }: { log: CoachClientSummaryMealLog }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textPrimary }}>
        {log.mealType} · {log.calories} kcal
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dateLabel(log.loggedAt)}</Text>
    </View>
  );
}

function CheckInRow({ checkIn }: { checkIn: CoachClientSummaryCheckIn }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textPrimary }}>
        Energy {checkIn.energy} · Soreness {checkIn.soreness} · Adherence {checkIn.adherence}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dateLabel(checkIn.createdAt)}</Text>
    </View>
  );
}

function BodyMeasurementRow({ measurement }: { measurement: CoachClientSummaryBodyMeasurement }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textPrimary }}>
        {measurement.weightKg != null ? `${measurement.weightKg} kg` : "Weight not set"}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dateLabel(measurement.loggedAt)}</Text>
    </View>
  );
}

function ClientProfileBody({ profile }: { profile: CoachClientProfile }) {
  const { t } = useTranslation();
  return (
    <>
      <Card style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" }}>
        {profile.serviceTypes.map((s) => (
          <View
            key={s}
            style={{
              backgroundColor: "rgba(99,102,241,0.15)",
              borderRadius: 999,
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
              {SERVICE_LABELS[s] ?? s}
            </Text>
          </View>
        ))}
        <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: "auto" }}>
          Client since {dateLabel(profile.activeSince)}
        </Text>
      </Card>

      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("clients.profile.coachingProfile")}</Text>
        <ProfileRow
          label={t("clients.profile.goals")}
          value={profile.coaching.goals.length ? profile.coaching.goals.join(", ") : t("common.notSet")}
        />
        <ProfileRow
          label={t("clients.profile.trainingLevel")}
          value={
            profile.coaching.trainingLevel
              ? LEVEL_LABELS[profile.coaching.trainingLevel] ?? profile.coaching.trainingLevel
              : "Not set"
          }
        />
        <ProfileRow label={t("clients.profile.diet")} value={profile.coaching.dietType ?? t("common.notSet")} />
      </Card>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Sessions</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{profile.sessions.totalCompleted} completed</Text>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Upcoming
        </Text>
        {profile.sessions.upcoming.length === 0 ? (
          <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{t("clients.profile.noneScheduled")}</Text>
        ) : (
          profile.sessions.upcoming.map((item) => (
            <Text key={item.id} style={{ color: colors.textPrimary, marginTop: 2 }}>
              {sessionLine(item)}
            </Text>
          ))
        )}

        {profile.sessions.past.length > 0 && (
          <>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: spacing.sm,
              }}
            >
              Recent
            </Text>
            {profile.sessions.past.map((item) => (
              <Text
                key={item.id}
                style={{ color: item.status === "cancelled" ? colors.textMuted : colors.textSecondary, marginTop: 2 }}
              >
                {sessionLine(item)}
                {item.status === "cancelled" ? " (cancelled)" : ""}
              </Text>
            ))}
            {profile.sessions.pastTruncated ? (
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.xs }}>
                {t("clients.profile.recentLimit")}
              </Text>
            ) : null}
          </>
        )}
      </Card>

      {profile.notAvailable.length > 0 && (
        <Card style={{ borderStyle: "dashed" }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("clients.profile.notAvailable")}
          </Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
            {t("clients.profile.healthWithheld")}
          </Text>
        </Card>
      )}
    </>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textSecondary }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, flexShrink: 1, textAlign: "right", marginLeft: spacing.md }}>
        {value}
      </Text>
    </View>
  );
}
