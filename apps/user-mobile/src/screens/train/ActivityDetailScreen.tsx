import React from "react";
import { Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { Pill } from "../../components/Pill";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { RouteMap } from "../../components/RouteMap";
import { StatTile } from "../../components/StatTile";
import { useToast } from "../../components/Toast";
import { deleteActivity, fetchActivity } from "../../api/activities";
import { extractErrorMessage } from "../../lib/apiError";
import { formatDateTime, formatDuration, formatKm, formatRate, kindLabel } from "../../lib/activityFormat";
import { colors, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ActivityDetail">;

/** One logged run/ride, with delete. Tracked activities show an SVG route preview (no map tiles). */
export function ActivityDetailScreen({ navigation, route }: Props) {
  const { activityId } = route.params;
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["activities", "detail", activityId],
    queryFn: () => fetchActivity(activityId),
  });

  const remove = useMutation({
    mutationFn: () => deleteActivity(activityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.show("Activity deleted", "success");
      navigation.goBack();
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't delete that activity."), "error"),
  });

  const confirmDelete = () =>
    Alert.alert("Delete activity?", "This removes it from your history and weekly totals.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate() },
    ]);

  return (
    <ScreenContainer title={data ? kindLabel(data.kind) : "Activity"} subtitle={data ? formatDateTime(data.startedAt) : undefined}>
      <BackButton onPress={() => navigation.goBack()} />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton height={140} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StatTile icon="target" label="Distance" value={formatKm(data.distanceMeters)} />
            <StatTile icon="clock" label="Time" value={formatDuration(data.durationSeconds)} tint={colors.success} tintSoft={colors.successSoft} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StatTile
              icon="zap"
              label={data.kind === "run" ? "Avg pace" : "Avg speed"}
              value={formatRate(data)}
              tint={colors.orange}
              tintSoft={colors.warningSoft}
            />
            <StatTile icon="flame" label="Calories" value={data.calories ?? "-"} tint={colors.orange} tintSoft={colors.warningSoft} />
          </View>
          {data.routePolyline ? <RouteMap polyline={data.routePolyline} /> : null}
          <Card style={{ gap: spacing.xs }}>
            <Pill label={data.source === "manual" ? "Manual entry" : "Tracked"} tone="neutral" />
            {data.elevationGainM != null ? (
              <Text style={{ color: colors.textSecondary }}>Elevation gain: {data.elevationGainM} m</Text>
            ) : null}
            {data.notes ? <Text style={{ color: colors.textSecondary }}>{data.notes}</Text> : null}
            {!data.hasRoute ? (
              <Text style={{ color: colors.textMuted, ...typography.meta }}>No route recorded for this activity.</Text>
            ) : null}
          </Card>
          <Button label="Delete activity" variant="secondary" onPress={confirmDelete} loading={remove.isPending} />
        </>
      )}
    </ScreenContainer>
  );
}
