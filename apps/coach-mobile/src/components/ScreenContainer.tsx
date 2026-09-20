import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { colors, spacing, typography } from "../theme/tokens";
import { fetchDashboardStats } from "../api/professionalDashboard";
import { fetchPendingRelationships } from "../api/relationshipRequests";
import type { RootStackParamList } from "../navigation/RootNavigator";

interface ScreenContainerProps {
  title: string;
  children?: React.ReactNode;
  scroll?: boolean;
  /** Set false on Notifications itself so its own header doesn't link back to itself. Defaults true — every other screen wants the global affordance. */
  showAlerts?: boolean;
}

/**
 * Global Notifications ("Alerts") header button (Wave 3, 20 Sep 2026) — see
 * NotificationsScreen.tsx's own doc comment for what this button leads to
 * and why it's Notifications-only, not an AI entry point too. Reuses the
 * exact same react-query cache keys (`professional-dashboard-stats`,
 * `coach-pending-requests`) TodayScreen.tsx / PendingRequestsScreen.tsx
 * already poll, so this doesn't add a new network round trip on screens
 * that already fetch one of those — it's a second subscriber to the same
 * cached query, not a duplicate fetch (react-query dedupes by key).
 */
function AlertsButton() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const dashboardQuery = useQuery({ queryKey: ["professional-dashboard-stats"], queryFn: fetchDashboardStats });
  const pendingQuery = useQuery({ queryKey: ["coach-pending-requests"], queryFn: fetchPendingRelationships });

  const count = (dashboardQuery.data?.stuckRelationships.length ?? 0) + (pendingQuery.data?.requests.length ?? 0);

  return (
    <Pressable
      onPress={() => navigation.navigate("Notifications")}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} need attention` : "Notifications"}
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>Alerts</Text>
      {count > 0 ? (
        <View
          style={{
            backgroundColor: colors.danger,
            borderRadius: 999,
            minWidth: 18,
            height: 18,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Shared per-screen header + safe-area shell — copied near-verbatim from apps/user-mobile, plus this app's own global Notifications button (Wave 3). */
export function ScreenContainer({ title, children, scroll = true, showAlerts = true }: ScreenContainerProps) {
  const Wrapper = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={[styles.header, styles.headerRow]}>
        <Text style={styles.title}>{title}</Text>
        {showAlerts ? <AlertsButton /> : null}
      </View>
      <Wrapper contentContainerStyle={scroll ? styles.scrollContent : styles.staticContent}>
        {children}
      </Wrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
});
