import React from "react";
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
import type { ClientsStackParamList } from "../../navigation/ClientsStack";
import { colors, spacing, typography } from "../../theme/tokens";

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
  const navigation = useNavigation<NativeStackNavigationProp<ClientsStackParamList>>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-clients"],
    queryFn: fetchClients,
  });

  return (
    <ScreenContainer title="Clients">
      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.clients.length === 0 && (
        <EmptyState
          title="No clients yet"
          subtitle="When a user books you and a coaching relationship starts, they'll appear here."
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
