import React from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchGymMe, GYM_ME_KEY } from "../../api/gym";
import { fmtGymDate, fmtGymDateTime, fmtGymRange, fmtGymTime, GYM_PRIVACY_FOOTER, gymDayShort } from "../../lib/gymFormat";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { GroupHeader } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "MyGym">;

const card = { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border } as const;

/**
 * My Gym (Figma My Gym 01): gym card with a live "Open now" pill, the gym's
 * latest active announcement, timings, equipment availability, and entry point
 * to today's gym workout. Everything comes from
 * GET /gym/me; the pill and the holiday card only render when they are true.
 */
export function MyGymScreen({ navigation }: Props) {
  const q = useQuery({ queryKey: GYM_ME_KEY, queryFn: fetchGymMe, retry: false });
  const notLinked = q.isError && isAxiosError(q.error) && q.error.response?.status === 404;
  const gym = q.data;

  const openGymWorkout = () =>
    (navigation.getParent() as { navigate: (name: string, params?: object) => void } | undefined)?.navigate("Train", {
      screen: "GymWorkout",
    });

  return (
    <RecoverShell centered title="My Gym" onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <SkeletonCard lines={4} />
      ) : notLinked ? (
        <View style={{ gap: spacing.md }}>
          <View style={{ ...card, padding: spacing.md, gap: 4 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>No gym linked</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>Enter a partner code from your gym to see it here.</Text>
          </View>
          <Button label="Enter partner code" onPress={() => navigation.navigate("PartnerCode")} />
        </View>
      ) : q.isError || !gym ? (
        <ErrorState message="Couldn't load your gym." onRetry={() => q.refetch()} />
      ) : (
        <>
          <View style={{ ...card, padding: 14, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Avatar name={gym.gym.name} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 16 }}>{gym.gym.name}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  {gym.location ? `${gym.location.name} · ` : ""}joined with code {gym.joinedWithCode}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
              {gym.openNow === true ? <Pill label="Open now" tone="success" /> : null}
              {!gym.gym.active ? <Pill label="Inactive" tone="warning" /> : null}
              {gym.today.closed ? (
                <Text style={{ color: colors.textSecondary, ...typography.meta }}>Today ({gymDayShort(gym.today.day)}) Closed</Text>
              ) : gym.today.opensAt && gym.today.closesAt ? (
                <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                  Today ({gymDayShort(gym.today.day)}) {fmtGymTime(gym.today.opensAt)} – {fmtGymTime(gym.today.closesAt)}
                </Text>
              ) : null}
            </View>
            {!gym.gym.active ? <Text style={{ color: colors.warning, ...typography.meta }}>This gym is no longer an active partner.</Text> : null}
          </View>

          {gym.announcement ? (
            <View
              style={{
                backgroundColor: colors.warningSoft,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.warning,
                padding: 14,
                gap: 4,
              }}
            >
              <Text style={{ color: colors.warning, fontFamily: fonts.bodyBold, fontSize: 12 }}>
                {gym.announcement.kind === "holiday" ? "Holiday update" : "Gym notice"}
              </Text>
              {gym.announcement.title !== (gym.announcement.kind === "holiday" ? "Holiday update" : "Gym notice") ? (
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{gym.announcement.title}</Text>
              ) : null}
              <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 18 }}>{gym.announcement.body}</Text>
              <Text style={{ color: colors.textMuted, ...typography.caption }}>
                Posted by {gym.gym.name} · {fmtGymDateTime(gym.announcement.postedAt)}
              </Text>
            </View>
          ) : null}

          <GroupHeader upper={false}>Gym timings</GroupHeader>
          {gym.timings.length === 0 ? (
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>This gym has not added its timings yet.</Text>
          ) : (
            <View style={{ ...card, overflow: "hidden" }}>
              {gym.timings.map((t, i) => (
                <View
                  key={t.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: spacing.md,
                    padding: 14,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text style={{ flexShrink: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{t.label}</Text>
                  <Text style={{ color: colors.textSecondary, ...typography.meta }}>{fmtGymRange(t.opensAt, t.closesAt, t.closed)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 15 }}>Equipment at this gym</Text>
              {gym.equipmentUpdatedAt ? (
                <Text style={{ color: colors.textMuted, ...typography.caption }}>Updated {fmtGymDate(gym.equipmentUpdatedAt)}</Text>
              ) : null}
            </View>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Your workouts are built only with machines this gym has.</Text>
          </View>
          {gym.equipment.length === 0 ? (
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>This gym has not listed its equipment yet.</Text>
          ) : (
            <View style={{ ...card, overflow: "hidden" }}>
              {gym.equipment.map((e, i) => (
                <View
                  key={e.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    padding: 14,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Icon name={e.available ? "check" : "x"} size={16} color={e.available ? colors.success : colors.danger} />
                  <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{e.name}</Text>
                  <Text style={{ color: e.available ? colors.success : colors.danger, ...typography.meta }}>
                    {e.available ? "Available" : `Not available · marked ${fmtGymDate(e.availabilityUpdatedAt)}`}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Button label="See today's gym workout" variant="secondary" onPress={openGymWorkout} />
          <Button label="Partner code" variant="secondary" onPress={() => navigation.navigate("PartnerCode")} />

          <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 17 }}>{GYM_PRIVACY_FOOTER}</Text>
        </>
      )}
    </RecoverShell>
  );
}
