import React, { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { Pill } from "../../components/Pill";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchPartner, linkPartnerCode, PARTNER_KEY, removePartnerCode } from "../../api/partner";
import { extractErrorCode, extractErrorMessage } from "../../lib/apiError";
import { BRAND_NAME } from "../../lib/brand";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { GroupHeader, OutlineButton, TextAction } from "./profileParts";
import { Avatar } from "../../components/Avatar";

type Props = NativeStackScreenProps<MoreStackParamList, "PartnerCode">;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export const PARTNER_PRIVACY_NOTE =
  "Partners see only that you joined with their code. Your health data stays private unless you choose to share it.";

/**
 * Partner code (Figma Profile & Settings 09). Link a partner gym by its invite
 * code (POST /users/me/partner-code); once linked it shows the partner, the
 * code, when it was linked and "Open My Gym". A failed link opens "Code
 * problems, explained" (not found / expired / already linked). The offer row
 * says "No member offer" because per-code offers do not exist yet.
 */
export function PartnerCodeScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const partnerQ = useQuery({ queryKey: PARTNER_KEY, queryFn: fetchPartner });
  const partner = partnerQ.data;
  const [code, setCode] = useState("");
  const [changing, setChanging] = useState(false);

  const link = useMutation({
    mutationFn: (value: string) => linkPartnerCode(value, changing),
    onSuccess: async () => {
      setCode("");
      setChanging(false);
      await queryClient.invalidateQueries({ queryKey: PARTNER_KEY });
    },
    onError: (err, value) => {
      const errCode = extractErrorCode(err);
      const reason =
        errCode === "partner_code_not_found"
          ? "not_found"
          : errCode === "partner_code_expired"
            ? "expired"
            : errCode === "partner_code_already_linked"
              ? "already_linked"
              : null;
      if (reason) navigation.navigate("PartnerCodeProblems", { reason, code: value.trim().toUpperCase() });
      else Alert.alert("Couldn't link code", extractErrorMessage(err, "Check your connection and try again."));
    },
  });

  const remove = useMutation({
    mutationFn: removePartnerCode,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PARTNER_KEY }),
    onError: (err) => Alert.alert("Couldn't remove code", extractErrorMessage(err, "Check your connection and try again.")),
  });

  const confirmRemove = () =>
    Alert.alert("Remove partner code?", "You will no longer be linked to this partner. You can add a code again any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => remove.mutate() },
    ]);

  const row = (label: string, value: string, last = false) => (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        ...(last ? {} : {}),
      }}
    >
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{value}</Text>
    </View>
  );

  const showForm = !partner || changing;

  return (
    <RecoverShell centered title="Partner code" onBack={() => navigation.goBack()}>
      {partnerQ.isLoading ? (
        <SkeletonCard lines={4} />
      ) : partnerQ.isError ? (
        <ErrorState message="Couldn't load your partner code." onRetry={() => partnerQ.refetch()} />
      ) : (
        <>
          {partner ? (
            <>
              <GroupHeader>Linked Partner</GroupHeader>
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: 6 }}>
                  <Avatar name={partner.gym.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 14 }}>{partner.gym.name}</Text>
                    <Text style={{ color: colors.textMuted, ...typography.meta }} numberOfLines={1}>
                      Gym{partner.gym.locations[0] ? ` · ${partner.gym.locations[0].name}` : ""}
                    </Text>
                  </View>
                  <Pill label={partner.active ? "Linked" : "Inactive"} tone={partner.active ? "success" : "warning"} />
                </View>
                {row("Code", partner.code)}
                {row("Linked on", fmtDate(partner.linkedAt))}
                {row("Offer on this code", partner.offer ? "Offer available" : "No member offer", true)}
                <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 6, lineHeight: 17 }}>
                  A partner code only tells {BRAND_NAME} which gym you joined with. One code per account.
                </Text>
              </View>

              <GroupHeader>Your Gym</GroupHeader>
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: 14, gap: spacing.md }}>
                <View>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 14 }}>{partner.gym.name}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }} numberOfLines={2}>
                    {partner.gym.locations.length > 0
                      ? partner.gym.locations.map((l) => l.name).join(" · ")
                      : "No locations listed yet"}
                  </Text>
                </View>
                <OutlineButton label="Open My Gym" onPress={() => navigation.navigate("MyGym")} />
              </View>
              <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 17 }}>{PARTNER_PRIVACY_NOTE}</Text>
            </>
          ) : (
            <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 18 }}>
              Joined through a gym or partner? Enter the code they gave you to link your account. A partner only learns
              that you joined with their code; they never see your data.
            </Text>
          )}

          {showForm ? (
            <View style={{ gap: spacing.sm }}>
              <GroupHeader>{changing ? "New partner code" : "Enter partner code"}</GroupHeader>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="Partner code"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Partner code"
                maxLength={40}
                style={{
                  height: 48,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  paddingHorizontal: spacing.md,
                  color: colors.textPrimary,
                  fontFamily: fonts.bodySemi,
                  letterSpacing: 1,
                }}
              />
              <Button label={changing ? "Replace code" : "Link code"} onPress={() => link.mutate(code)} loading={link.isPending} disabled={!code.trim()} />
              {changing ? <TextAction label="Cancel" onPress={() => { setChanging(false); setCode(""); }} /> : null}
              <Text style={{ color: theme.accent, ...typography.meta, textAlign: "center" }} onPress={() => navigation.navigate("PartnerCodeProblems", {})}>
                Having trouble with a code?
              </Text>
            </View>
          ) : (
            <>
              <OutlineButton label="Change partner code" onPress={() => setChanging(true)} />
              <TextAction label={remove.isPending ? "Removing…" : "Remove code"} danger onPress={confirmRemove} />
            </>
          )}
        </>
      )}
    </RecoverShell>
  );
}
