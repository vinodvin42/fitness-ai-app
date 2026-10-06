import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Notification, NotificationCategory, NotificationKind, NotificationsResponse } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { Icon, IconName } from "../../components/Icon";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { SwipeToDismiss } from "../../components/SwipeToDismiss";
import { useToast } from "../../components/Toast";
import { dismissNotification, fetchNotifications, markAllNotificationsRead, markNotificationRead } from "../../api/notifications";
import { openNotificationDeepLink } from "../../lib/deepLink";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TodayStackParamList } from "../../navigation/TodayStack";

type Props = NativeStackScreenProps<TodayStackParamList, "Notifications">;

type Filter = "all" | NotificationCategory;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "workouts", label: "Workouts" },
  { key: "nutrition", label: "Nutrition" },
];

const KIND_ICON: Record<NotificationKind, IconName> = {
  reminder: "bell",
  workout: "dumbbell",
  nutrition: "utensils",
  coach: "message",
  billing: "trophy",
  system: "sparkles",
};

// Figma Today 02: workout = blue, coach = green, report/system = violet.
const KIND_TINT: Record<NotificationKind, string> = {
  reminder: colors.accent,
  workout: colors.accent,
  nutrition: colors.warning,
  coach: colors.success,
  billing: colors.warning,
  system: colors.aiAccent,
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

function stamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const g = groupOf(iso);
  if (g === "Today") return time;
  if (g === "Yesterday") return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

/**
 * Today 02 - Notifications: the real server inbox (GET /notifications) grouped
 * Today / Yesterday / Earlier, All / Workouts / Nutrition pills (server-side
 * `category` filter), tap to mark read (and deep-link when the link maps to a
 * known route), swipe left (or the x button on web) to dismiss via
 * POST /notifications/:id/dismiss, mark all read, pull to refresh.
 */
export function NotificationsScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const query = useInfiniteQuery({
    queryKey: ["notifications", filter],
    queryFn: ({ pageParam }) =>
      fetchNotifications({ category: filter === "all" ? undefined : filter, cursor: pageParam as string | null }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: NotificationsResponse) => last.nextCursor,
  });

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.items).filter((n) => !dismissed.has(n.id)),
    [query.data, dismissed],
  );
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
  const dismissOne = useMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onSuccess: invalidate,
    onError: (err, id) => {
      // Put the row back: the server still has it.
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.show(extractErrorMessage(err, "Couldn't dismiss that notification."), "error");
    },
  });

  const onDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
    dismissOne.mutate(id);
  };

  const onOpen = (n: Notification) => {
    if (!n.readAt) readOne.mutate(n.id);
    openNotificationDeepLink(navigation.getParent<NavigationProp<MainTabsParamList>>(), n.deepLink);
  };

  return (
    <ScreenContainer
      title="Notifications"
      subtitle="Stay updated with your daily vitals"
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
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityLabel={f.label}
              accessibilityState={{ selected: active }}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 9,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.textPrimary : colors.surface,
                borderWidth: 1,
                borderColor: active ? colors.textPrimary : colors.border,
              }}
            >
              <Text style={{ color: active ? colors.background : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{f.label}</Text>
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        {unreadCount > 0 ? (
          <Pressable
            onPress={() => readAll.mutate()}
            disabled={readAll.isPending}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            hitSlop={8}
          >
            <Text style={{ color: theme.accent, ...typography.label, fontSize: 12 }}>
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
          title="You're all caught up"
          subtitle={
            filter === "all"
              ? "Workout, coaching, billing and reminder updates will show up here."
              : `No ${filter} notifications right now.`
          }
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {groups.map((g) => (
            <View key={g.label} style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textMuted, ...typography.label }}>{g.label}</Text>
              {g.rows.map((n) => (
                <SwipeToDismiss key={n.id} onDismiss={() => onDismiss(n.id)} dismissLabel={`Dismiss ${n.title}`}>
                  <Pressable
                    onPress={() => onOpen(n)}
                    accessibilityRole="button"
                    accessibilityLabel={`${n.readAt ? "" : "Unread. "}${n.title}. ${n.body}`}
                    style={{
                      flexDirection: "row",
                      gap: spacing.md,
                      alignItems: "center",
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: radius.card,
                      padding: 14,
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: KIND_TINT[n.kind] ?? theme.accent,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name={KIND_ICON[n.kind] ?? "bell"} size={20} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>{n.title}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 }} numberOfLines={2}>
                        {n.body}
                      </Text>
                      <Text style={{ color: colors.textMuted, ...typography.caption, marginTop: 4 }}>{stamp(n.createdAt)}</Text>
                    </View>
                    {!n.readAt ? (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent }} accessibilityLabel="Unread" />
                    ) : null}
                  </Pressable>
                </SwipeToDismiss>
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
          <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.sm }}>
            Swipe left to dismiss a notification
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}
