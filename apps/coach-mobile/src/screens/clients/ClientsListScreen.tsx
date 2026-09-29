import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { CoachClientListItem } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchClients } from "../../api/professionalClients";
import { fetchPendingRelationships } from "../../api/relationshipRequests";
import type { ClientsStackParamList } from "../../navigation/ClientsStack";
import { colors, radius, spacing, typography } from "../../theme/tokens";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

function relativeDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Clients list (docs/coach/03-screen-inventory.md §D), added 31 Aug 2026 —
 * the coach's real active clients, derived from `Relationship`/`Booking`
 * data (see apps/api's professionalClients.service.ts). Tapping a client
 * opens their Profile. Previously an honest "Coming soon" placeholder
 * (MainTabs.tsx named this exact gap).
 */
export function ClientsListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ClientsStackParamList>>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-clients"],
    queryFn: fetchClients,
  });
  // gap §56 — the real coach-side review gate's entry point. Polled at the
  // same cadence a screen focus would naturally refetch it; no push/badge
  // infra exists in this build to update it live in the background.
  const { data: pending } = useQuery({
    queryKey: ["coach-pending-requests"],
    queryFn: fetchPendingRelationships,
  });
  const pendingCount = pending?.requests.length ?? 0;

  return (
    <ScreenContainer title={t("clients.title")}>
      {pendingCount > 0 && (
        <Pressable onPress={() => navigation.navigate("PendingRequests")}>
          <Card
            style={{
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.accent,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: spacing.sm,
            }}
          >
            <View>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>
                {pendingCount} pending request{pendingCount === 1 ? "" : "s"}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {t("clients.reviewAndRespond")}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: colors.accent,
                borderRadius: radius.sm,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
              }}
            >
              <Text style={{ color: "#0B0B0F", fontWeight: "700" }}>Review</Text>
            </View>
          </Card>
        </Pressable>
      )}

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.clients.length === 0 && (
        <EmptyState
          title={t("clients.emptyTitle")}
          subtitle={t("clients.emptySubtitle")}
        />
      )}

      {data && data.clients.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          {data.clients.map((client: CoachClientListItem) => (
            <Pressable
              key={client.userId}
              onPress={() =>
                navigation.navigate("ClientProfile", { userId: client.userId, fullName: client.fullName })
              }
            >
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{client.fullName}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {client.serviceTypes.map((s) => SERVICE_LABELS[s] ?? s).join(" · ")}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>›</Text>
                </View>
                <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
                  <View>
                    <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Sessions
                    </Text>
                    <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{client.sessionsCompleted}</Text>
                  </View>
                  <View>
                    <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Next
                    </Text>
                    <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                      {relativeDay(client.nextSessionAt)}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Last
                    </Text>
                    <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                      {relativeDay(client.lastSessionAt)}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
