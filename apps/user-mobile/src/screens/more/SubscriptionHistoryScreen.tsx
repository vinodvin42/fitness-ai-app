import React from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SubscriptionDetail } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchSubscriptionHistory } from "../../api/subscriptions";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "SubscriptionHistory">;

const STATUS_COLOR: Record<SubscriptionDetail["status"], string> = {
  active: colors.success,
  trialing: colors.accent,
  past_due: colors.warning,
  canceled: colors.textMuted,
  // Gap §57 (18 Sep 2026) — real terminal states, distinct from each other.
  expired: colors.textMuted,
  revoked: colors.danger,
};

/**
 * Purchase History (docs/mobile/03-screen-inventory.md §M) — a plain
 * reverse-chronological list of every Subscription row for this user, not
 * the design's filterable transaction list (no separate Transaction
 * entity exists yet — see docs/mobile/05-data-model.md §2 — since there's
 * no payment gateway generating real transactions).
 */
export function SubscriptionHistoryScreen(_props: Props) {
  const { data: history, isLoading, isError, refetch } = useQuery({
    queryKey: ["subscriptions", "history"],
    queryFn: fetchSubscriptionHistory,
  });

  return (
    <ScreenContainer title="Purchase History" scroll={false}>
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={history ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{item.plan.name}</Text>
                <Text style={{ color: STATUS_COLOR[item.status], ...typography.meta }}>{item.status}</Text>
              </View>
              <Text style={{ color: colors.textMuted, marginTop: spacing.xs }}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </Card>
          )}
          ListEmptyComponent={<EmptyState title="No subscription history yet" subtitle="Subscribe to a plan to see it show up here." />}
        />
      )}
    </ScreenContainer>
  );
}
