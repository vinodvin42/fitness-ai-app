import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Notification, NotificationKind, NotificationsResponse } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import { Icon, IconName } from "../../components/Icon";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "../../api/notifications";
import { openNotificationDeepLink } from "../../lib/deepLink";
import { extractErrorMessage } from "../../lib/apiError";
import { timeAgo } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TodayStackParamList } from "../../navigation/TodayStack";

type Props = NativeStackScreenProps<TodayStackParamList, "Notifications">;

type Filter = "all" | "unread";

const KIND_ICON: Record<NotificationKind, IconName> = {
  reminder: "bell",
  workout: "dumbbell",
  coach: "message",
  billing: "trophy",
  system: "sparkles",
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupOf(iso: string): "Today" | "Yesterday" | "Earlier" {
  const created = new Date(iso);
  const now = new Date();
  if (dayKey(created) === dayKey(now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  return dayKey(created) === dayKey(y) ? "Yesterday" : "Earlier";
}

/**
 * Today 02 - Notifications: the real server inbox (GET /notifications) grouped
 * Today / Yesterday / Earlier, All / Unread filter, tap to mark read (and
 * deep-link when the link maps to a known route), mark all read, pull to refresh.
 */
export function NotificationsScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");

  const query = useInfiniteQuery({
    queryKey: ["notifications", filter],
    queryFn: ({ pageParam }) =>
      fetchNotifications({ filter: filter === "unread" ? "unread" : undefined, cursor: pageParam as string | null }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: NotificationsResponse) => last.nextCursor,
  });

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items), [query.data]);
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;

  const groups = useMemo(() => {
    const order = ["Today", "Yesterday", "Earlier"] as const;
    return order
      .map((label) => ({ label, rows: items.filter((n) => groupOf(n.createdAt) === label) }))
      .filter((g) => g.rows.length > 0);
  }, [items]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const readOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: invalidate,
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't mark all as read."), "error"),
  });

  const onOpen = (n: Notification) => {
    if (!n.readAt) readOne.mutate(n.id);
    openNotificationDeepLink(navigation.getParent<NavigationProp<MainTabsParamList>>(), n.deepLink);
  };

  return (
    <ScreenContainer
      title="Notifications"
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => query.refetch()}
          tintColor={theme.accent}
        />
      }
    >
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Chip label="All" selected={filter === "all"} onPress={() => setFilter("all")} />
        <Chip
          label={unreadCount > 0 ? `Unread (${unreadCount})` : "Unread"}
          selected={filter === "unread"}
          onPress={() => setFilter("unread")}
        />
        <View style={{ flex: 1 }} />
        {unreadCount > 0 ? (
          <Pressable
            onPress={() => readAll.mutate()}
            disabled={readAll.isPending}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            hitSlop={8}
          >
            <Text style={{ color: theme.accent, ...typography.label }}>
              {readAll.isPending ? "Marking..." : "Mark all read"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {query.isLoading ? (
        <SkeletonCard lines={3} />
      ) : query.isError ? (
        <ErrorState message="Couldn't load your notifications." onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={filter === "unread" ? "No unread notifications" : "You're all caught up"}
          subtitle={
            filter === "unread"
              ? "Everything has been read."
              : "Workout, coaching, billing and reminder updates will show up here."
          }
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {groups.map((g) => (
            <View key={g.label} style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textMuted, ...typography.label }}>{g.label.toUpperCase()}</Text>
              {g.rows.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => onOpen(n)}
                  accessibilityRole="button"
                  accessibilityLabel={`${n.readAt ? "" : "Unread. "}${n.title}. ${n.body}`}
                >
                  <Card style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: radius.md,
                        backgroundColor: colors.accentSoft,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name={KIND_ICON[n.kind] ?? "bell"} size={20} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{n.title}</Text>
                      <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{n.body}</Text>
                      <Text style={{ color: colors.textMuted, ...typography.caption, marginTop: 4 }}>
                        {timeAgo(n.createdAt)}
                      </Text>
                    </View>
                    {!n.readAt ? (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent, marginTop: 6 }} />
                    ) : null}
                  </Card>
                </Pressable>
              ))}
            </View>
          ))}
          {query.hasNextPage ? (
            <Button
              label="Load more"
              variant="secondary"
              loading={query.isFetchingNextPage}
              onPress={() => query.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
    </ScreenContainer>
  );
}
