import React, { useState } from "react";
import { ActivityIndicator, Linking, Text, View } from "react-native";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SupportTicket } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ListRow } from "../../components/ListRow";
import { Pill } from "../../components/Pill";
import { SearchBar } from "../../components/SearchBar";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchMyTickets } from "../../api/support";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Support">;

// Real answers about this build's actual behavior, not generic filler —
// each one points at a screen/flow that genuinely exists.
const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  { q: "How do I log a workout?", a: "Open a program from Train, pick a workout, and tap Start Workout. Log each set as you go, then tap Finish." },
  { q: "How do I purchase a program?", a: "Open a priced program from Train and tap Purchase — it unlocks immediately. No payment card is required yet." },
  { q: "How do I change my password?", a: "Go to More -> Settings -> Security & Privacy -> Change Password. You'll be signed out of every session afterward, for security." },
  { q: "Are Reminders synced across devices?", a: "Not yet — Reminders schedule local notifications on each device individually; there's no server-push sync between devices." },
  { q: "How do I change my language?", a: "Go to More -> Settings -> Language. Your choice is saved, but the app's own text is still English everywhere for now." },
  { q: "How do I delete my account?", a: "Go to More -> Settings -> Security & Privacy -> Delete Account. This permanently deletes your workouts, meals, measurements, purchases, and reminders." },
];

const STATUS_LABEL: Record<SupportTicket["status"], string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_TONE: Record<SupportTicket["status"], "warning" | "accent" | "success" | "neutral"> = {
  open: "warning",
  in_progress: "accent",
  resolved: "success",
  closed: "neutral",
};

const CATEGORY_LABEL: Record<SupportTicket["category"], string> = {
  bug: "Bug report",
  feature_request: "Feature request",
  billing: "Billing",
  account: "Account",
  other: "Other",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

/**
 * Support (docs/mobile/03-screen-inventory.md §L, Phase 4 continued
 * 19 Aug 2026) — real ticket submission and a real "my tickets" list
 * against a new `SupportTicket` backend (`apps/api/src/modules/support`),
 * a real "Email Support" quick-contact action via the device's mail app,
 * and a static (not fake — just not server-driven) FAQ list answering
 * real questions about this build. Not built: live chat (needs real
 * chat/agent infrastructure, not just a screen) and any ticket-status
 * progression beyond `open` — there's no admin console yet (Phase 6) for
 * anyone to triage, reply to, or resolve a ticket, so every ticket you
 * submit here will show "Open" until that exists.
 */
export function SupportScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const { data: tickets, isLoading, isError, refetch } = useQuery({ queryKey: ["support", "tickets"], queryFn: fetchMyTickets });

  const filteredFaq = FAQ_ITEMS.filter(
    (item) =>
      item.q.toLowerCase().includes(query.trim().toLowerCase()) ||
      item.a.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const onEmailSupport = () => {
    Linking.openURL("mailto:support@23primefit.app?subject=23PrimeFit%20Support");
  };

  return (
    <ScreenContainer title="Support">
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search help articles" />

      <ListRow
        icon="mail"
        title="Email Support"
        subtitle="support@23primefit.app"
        tint={colors.accent}
        tintSoft={colors.accentSoft}
        onPress={onEmailSupport}
      />

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>FAQ</Text>
        {filteredFaq.length === 0 ? (
          <Text style={{ color: colors.textSecondary }}>No articles match "{query}".</Text>
        ) : (
          <View style={{ gap: spacing.md }}>
            {filteredFaq.map((item) => (
              <View key={item.q}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi }}>{item.q}</Text>
                <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>{item.a}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>My Tickets</Text>
          <Button
            label="New Ticket"
            onPress={() => navigation.navigate("SupportTicketForm")}
            style={{ height: 36, paddingHorizontal: spacing.md }}
          />
        </View>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (tickets ?? []).length === 0 ? (
          <EmptyState title="No tickets yet" subtitle="Run into a bug or have a question? Open a new ticket." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {(tickets ?? []).map((ticket) => (
              <View key={ticket.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, flex: 1, marginRight: spacing.sm }}>
                    {ticket.subject}
                  </Text>
                  <Pill label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />
                </View>
                <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
                  {CATEGORY_LABEL[ticket.category]} · {formatDate(ticket.createdAt)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.lg }}>
        23PrimeFit v{Constants.expoConfig?.version ?? "—"}
      </Text>
    </ScreenContainer>
  );
}
