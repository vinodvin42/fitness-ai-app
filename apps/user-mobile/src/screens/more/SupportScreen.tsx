import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SupportTicket } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Icon, IconName } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { SearchBar } from "../../components/SearchBar";
import { ErrorState } from "../../components/ErrorState";
import { GroupCard, SectionLabel } from "../../components/SettingsParts";
import { fetchMyTickets } from "../../api/support";
import { fetchHelpArticles, fetchHelpCategories } from "../../api/help";
import { BRAND_NAME, SUPPORT_EMAIL } from "../../lib/brand";
import { timeAgo } from "../../lib/deviceLabel";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Support">;

// Exported so SupportTicketDetailScreen.tsx can reuse the exact same
// labels/tones rather than duplicating this mapping.
export const STATUS_LABEL: Record<SupportTicket["status"], string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const STATUS_TONE: Record<SupportTicket["status"], "warning" | "accent" | "success" | "neutral"> = {
  open: "warning",
  in_progress: "accent",
  resolved: "success",
  closed: "neutral",
};

export const CATEGORY_LABEL: Record<SupportTicket["category"], string> = {
  bug: "Bug report",
  feature_request: "Feature request",
  billing: "Billing",
  account: "Account",
  other: "Other",
};

function ContactCard({
  icon,
  title,
  subtitle,
  onPress,
  tint,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  tint: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        flex: 1,
        minHeight: 92,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
        gap: 6,
        justifyContent: "space-between",
      }}
    >
      <Icon name={icon} size={20} color={tint} />
      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 11 }} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Figma Settings 13 - Help & Support. Search real help articles
 * (GET /help/articles), an "Open a ticket" card (there is no live chat -
 * tickets get a reply thread), an Email Us card (only when a support email is
 * configured, see lib/brand.ts), FAQ categories with real article counts,
 * your most recent real tickets with status chips, and Report Bug / Feature
 * Request shortcuts that open the ticket form with that category preset.
 */
export function SupportScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const categories = useQuery({ queryKey: ["help", "categories"], queryFn: fetchHelpCategories });
  const tickets = useQuery({ queryKey: ["support", "tickets"], queryFn: fetchMyTickets });
  const search = useQuery({
    queryKey: ["help", "search", debounced],
    queryFn: () => fetchHelpArticles({ search: debounced }),
    enabled: debounced.length > 0,
  });

  const searching = query.trim().length > 0;
  const recent = (tickets.data ?? []).slice(0, 4);

  return (
    <ScreenContainer title="Help & Support">
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search help articles..." />

      {searching ? (
        <>
          <SectionLabel text="Search results" />
          {search.isLoading || debounced !== query.trim() ? (
            <ActivityIndicator color={colors.accent} />
          ) : search.isError ? (
            <ErrorState onRetry={() => search.refetch()} />
          ) : (search.data ?? []).length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>No articles match "{query.trim()}". Try different words or open a ticket.</Text>
          ) : (
            <GroupCard>
              {(search.data ?? []).map((a) => (
                <Pressable
                  key={a.slug}
                  onPress={() => navigation.navigate("HelpArticle", { slug: a.slug })}
                  accessibilityRole="button"
                  style={{ padding: 14, gap: 3 }}
                >
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{a.title}</Text>
                  <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 16 }} numberOfLines={2}>
                    {a.snippet}
                  </Text>
                </Pressable>
              ))}
            </GroupCard>
          )}
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ContactCard
              icon="message"
              title="Open a ticket"
              subtitle="Describe the problem; replies arrive in the ticket thread."
              tint={colors.success}
              onPress={() => navigation.navigate("SupportTicketForm")}
            />
            {SUPPORT_EMAIL ? (
              <ContactCard
                icon="mail"
                title="Email Us"
                subtitle={SUPPORT_EMAIL}
                tint={theme.accent}
                onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${BRAND_NAME} Support`)}`)}
              />
            ) : null}
          </View>

          <SectionLabel text="FAQ Categories" />
          {categories.isLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : categories.isError ? (
            <ErrorState onRetry={() => categories.refetch()} />
          ) : (
            <GroupCard>
              {(categories.data ?? []).map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => navigation.navigate("HelpArticleList", { category: c.key, title: c.label })}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.label}, ${c.articleCount} articles`}
                  style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: spacing.sm }}
                >
                  <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{c.label}</Text>
                  <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                    {c.articleCount} {c.articleCount === 1 ? "article" : "articles"}
                  </Text>
                  <Icon name="chevron-right" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </GroupCard>
          )}

          <SectionLabel text="Your Recent Tickets" />
          {tickets.isLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : tickets.isError ? (
            <ErrorState onRetry={() => tickets.refetch()} />
          ) : recent.length === 0 ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>No tickets yet. Run into a problem or have a question? Open a ticket.</Text>
            </View>
          ) : (
            <GroupCard>
              {recent.map((ticket) => (
                <Pressable
                  key={ticket.id}
                  onPress={() => navigation.navigate("SupportTicketDetail", { ticketId: ticket.id })}
                  accessibilityRole="button"
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: 14 }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 }} numberOfLines={1}>
                      #{ticket.id.slice(0, 4).toUpperCase()} {ticket.subject}
                    </Text>
                    <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>Created {timeAgo(ticket.createdAt)}</Text>
                  </View>
                  <Pill label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />
                </Pressable>
              ))}
            </GroupCard>
          )}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ContactCard
              icon="bug"
              title="Report Bug"
              subtitle="Something isn't working"
              tint={colors.danger}
              onPress={() => navigation.navigate("SupportTicketForm", { category: "bug" })}
            />
            <ContactCard
              icon="star"
              title="Feature Request"
              subtitle="Tell us what's missing"
              tint={theme.accent}
              onPress={() => navigation.navigate("SupportTicketForm", { category: "feature_request" })}
            />
          </View>
        </>
      )}

      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.md }}>
        App Version {Constants.expoConfig?.version ?? "-"}
      </Text>
    </ScreenContainer>
  );
}
