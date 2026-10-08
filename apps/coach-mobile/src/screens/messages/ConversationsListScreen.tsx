import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { CoachConversationSummary } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchConversations } from "../../api/coachMessages";
import type { MessagesStackParamList } from "../../navigation/MessagesStack";
import { colors, spacing, typography } from "../../theme/tokens";

function whenLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Conversations list (docs/coach/03-screen-inventory.md), added 31 Aug 2026.
 * One row per active client, most-recent activity first, with a real unread
 * count. Backed by apps/api's coachMessages.service.ts. Previously an honest
 * "Coming soon" placeholder.
 */
export function ConversationsListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<MessagesStackParamList>>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-conversations"],
    queryFn: fetchConversations,
    // Not real-time — refetch every 15s so unread counts stay roughly live.
    refetchInterval: 15_000,
  });

  return (
    <ScreenContainer title={t("messages.title")}>
      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.conversations.length === 0 && (
        <EmptyState
          title={t("messages.emptyTitle")}
          subtitle={t("messages.emptySubtitle")}
        />
      )}

      {data && data.conversations.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          {data.conversations.map((c: CoachConversationSummary) => (
            <Pressable
              key={c.partnerId}
              onPress={() => navigation.navigate("Thread", { userId: c.partnerId, fullName: c.partnerName })}
            >
              <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{c.partnerName}</Text>
                  <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    {c.lastMessage ?? "No messages yet"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{whenLabel(c.lastMessageAt)}</Text>
                  {c.unreadCount > 0 ? (
                    <View
                      style={{
                        backgroundColor: colors.accent,
                        borderRadius: 999,
                        minWidth: 20,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#0B0B0F", fontSize: 11, fontWeight: "700" }}>{c.unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
