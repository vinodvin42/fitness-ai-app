import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CoachConversationSummary } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchConversations } from "../../api/coachMessages";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Conversations">;

function whenLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Messages — consumer side (docs/coach/03-screen-inventory.md), added 31 Aug
 * 2026. One conversation per active coach, with a real unread count. Backed
 * by apps/api's coachMessages.service.ts. Also reachable per-coach directly
 * from My Professional Team's "Message" button.
 */
export function ConversationsScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-conversations"],
    queryFn: fetchConversations,
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <ScreenContainer title="Messages">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer title="Messages">
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Messages">
      {data.conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          subtitle="Once you have a coach, you can message each other here."
          actionLabel="Find a Coach"
          onAction={() => navigation.navigate("CoachDiscovery", undefined)}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {data.conversations.map((c: CoachConversationSummary) => (
            <Pressable
              key={c.partnerId}
              onPress={() =>
                navigation.navigate("MessageThread", { professionalId: c.partnerId, fullName: c.partnerName })
              }
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
                      <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: fonts.bodyBold }}>{c.unreadCount}</Text>
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
