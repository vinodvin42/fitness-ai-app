import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import {
  acceptProfessionalOffer,
  declineProfessionalOffer,
  fetchProfessionalOffers,
} from "../../api/professionalOffers";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Offers">;

type Filter = "offered" | "declined" | "expired" | "accepted";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "offered", label: "Open" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
];

const EMPTY_COPY: Record<Filter, { title: string; subtitle: string }> = {
  offered: {
    title: "No open offers",
    subtitle: "When Fynrox proposes you as a client's professional, it'll appear here to accept or decline.",
  },
  accepted: { title: "Nothing accepted yet", subtitle: "Offers you take on will be listed here." },
  declined: { title: "Nothing declined", subtitle: "Offers you turn down stay here for your own record." },
  expired: {
    title: "Nothing expired",
    subtitle: "An offer you don't answer within 48 hours goes back to Fynrox to re-match.",
  },
};

/**
 * P-M7 — "Offers list; decline reason; declined confirmation; offer
 * expired. Only one offer is designed."
 *
 * DESIGN-PENDING P-M7, P-M8.
 *
 * Before this the Today queue showed live offers only, so a professional
 * who declined one had no record of what they turned down, and one that
 * expired while they were away simply vanished. Both matter: an offer is
 * a client Fynrox thought was a fit, and a professional who keeps
 * missing them should be able to see that pattern rather than have it
 * quietly counted against their capacity.
 *
 * Declining asks for a reason but does not require one. The reason helps
 * matching; demanding it would push people toward the path of least
 * resistance, which is letting the offer expire — the worst outcome for
 * the waiting client.
 */
export function OffersScreen(_props: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("offered");
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const offers = useQuery({
    queryKey: ["professionalOffers", filter],
    queryFn: () => fetchProfessionalOffers(filter),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["professionalOffers"] });
    queryClient.invalidateQueries({ queryKey: ["professionalDashboard"] });
  };

  const accept = useMutation({
    mutationFn: (offerId: string) => acceptProfessionalOffer(offerId),
    onSuccess: invalidate,
    onError: () => Alert.alert("Couldn't accept", "This offer may have expired or been withdrawn. Pull to refresh."),
  });

  const decline = useMutation({
    mutationFn: (offerId: string) => declineProfessionalOffer(offerId, reason.trim() ? { reason: reason.trim() } : {}),
    onSuccess: () => {
      setDecliningId(null);
      setReason("");
      invalidate();
    },
    onError: () => Alert.alert("Couldn't decline", "This offer may have already been acted on."),
  });

  if (offers.isLoading) {
    return (
      <ScreenContainer title={t("clients.offers.title")}>
      <Text style={{ color: colors.textMuted, ...typography.meta, marginBottom: spacing.lg }}>
        {t("clients.offers.intro")}
      </Text>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }
  if (offers.isError) {
    return (
      <ScreenContainer title={t("clients.offers.title")}>
        <ErrorState onRetry={offers.refetch} />
      </ScreenContainer>
    );
  }

  const rows = offers.data?.offers ?? [];

  function hoursLeft(expiresAt: string | null): number | null {
    if (!expiresAt) return null;
    return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 3_600_000));
  }

  return (
    <ScreenContainer title={t("clients.offers.title")}>
      <View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", marginBottom: spacing.lg }}>
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            label={f.label}
            variant={filter === f.value ? "primary" : "secondary"}
            onPress={() => setFilter(f.value)}
          />
        ))}
      </View>

      {rows.length === 0 ? (
        <EmptyState title={EMPTY_COPY[filter].title} subtitle={EMPTY_COPY[filter].subtitle} />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {rows.map((o) => {
            const left = hoursLeft(o.expiresAt);
            return (
              <Card key={o.offerId}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: spacing.sm }}>
                    <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{o.userFullName}</Text>
                    <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
                      {o.serviceType === "fitness" ? "Fitness" : "Nutrition"} ·{" "}
                      {new Date(o.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <StatusBadge status={o.status} />
                </View>

                {/* The countdown is the client's wait, not the coach's
                    deadline — framed that way on purpose. */}
                {o.status === "offered" && left != null ? (
                  <Text
                    style={{
                      color: left <= 6 ? colors.warning : colors.textSecondary,
                      ...typography.meta,
                      marginTop: spacing.xs,
                    }}
                  >
                    {left === 0
                      ? "Expiring now — this goes back to Fynrox to re-match."
                      : `${left} hour${left === 1 ? "" : "s"} left before this returns to Fynrox.`}
                  </Text>
                ) : null}

                {o.status === "expired" ? (
                  <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
                    {t("clients.offers.returned")}
                  </Text>
                ) : null}

                {o.status === "offered" ? (
                  decliningId === o.offerId ? (
                    <View style={{ marginTop: spacing.lg }}>
                      <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                        {t("clients.offers.whyDeclining")}
                      </Text>
                      <TextInput
                        value={reason}
                        onChangeText={setReason}
                        multiline
                        numberOfLines={3}
                        maxLength={500}
                        placeholder={t("clients.offers.reasonPlaceholder")}
                        placeholderTextColor={colors.textMuted}
                        style={{
                          color: colors.textPrimary,
                          backgroundColor: colors.surfaceRaised,
                          borderRadius: radius.card,
                          padding: spacing.sm,
                          marginTop: spacing.xs,
                          minHeight: 72,
                          textAlignVertical: "top",
                        }}
                      />
                      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                        <Button
                          label={t("clients.offers.confirmDecline")}
                          onPress={() => decline.mutate(o.offerId)}
                          loading={decline.isPending}
                        />
                        <Button
                          label={t("common.back")}
                          variant="secondary"
                          onPress={() => {
                            setDecliningId(null);
                            setReason("");
                          }}
                        />
                      </View>
                      <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
                        {o.userFullName.split(" ")[0]} won't be told a reason — only that we're finding someone else.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
                      <Button label={t("common.accept")} onPress={() => accept.mutate(o.offerId)} loading={accept.isPending} />
                      <Button label={t("common.decline")} variant="secondary" onPress={() => setDecliningId(o.offerId)} />
                    </View>
                  )
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}
