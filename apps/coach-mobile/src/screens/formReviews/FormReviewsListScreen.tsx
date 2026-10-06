import React from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { fetchFormReviews } from "../../api/formReviews";
import { colors, spacing } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

/** Form reviews: clips submitted by this coach's active clients, queued first. */
export function FormReviewsListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const query = useQuery({ queryKey: ["coach-form-reviews"], queryFn: fetchFormReviews });

  return (
    <ScreenContainer title="Form reviews">
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
        ‹ More
      </Text>
      {query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.data && query.data.length === 0 ? (
        <EmptyState title="No clips yet" subtitle="Form-check clips from your clients will show up here." />
      ) : (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {(query.data ?? []).map((item) => (
            <Pressable key={item.id} onPress={() => navigation.navigate("FormReviewDetail", { id: item.id })}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                    {item.userFirstName} · {item.exerciseName ?? "Exercise not specified"}
                  </Text>
                  <Text style={{ color: item.status === "queued" ? colors.warning : colors.success, fontSize: 12 }}>
                    {item.status === "queued" ? "Needs review" : "Reviewed"}
                  </Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
