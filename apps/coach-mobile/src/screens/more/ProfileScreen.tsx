import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { SelectCard } from "../../components/SelectCard";
import { fetchMe, setMyGender } from "../../api/professionalAuth";
import { extractErrorMessage } from "../../lib/apiError";
import { showAlert } from "../../lib/dialogs";
import { colors, spacing, typography } from "../../theme/tokens";

type Choice = "female" | "male" | "none";

const OPTIONS: Array<{ value: Choice; key: "profile.female" | "profile.male" | "profile.preferNot" }> = [
  { value: "female", key: "profile.female" },
  { value: "male", key: "profile.male" },
  { value: "none", key: "profile.preferNot" },
];

/**
 * My profile (owner, 20 Oct 2026: "give male and female coaches option").
 * The coach states their gender so members who ask for a male or female
 * coach can be matched with them (apps/api lib/coachGender.ts). "Prefer not
 * to say" leaves it unset; such a coach only gets requests with no preference.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["professionalMe"], queryFn: fetchMe });
  const [choice, setChoice] = useState<Choice | null>(null);
  const current: Choice = me.data?.professional.gender ?? "none";

  useEffect(() => {
    if (me.data && choice === null) setChoice(me.data.professional.gender ?? "none");
  }, [me.data, choice]);

  const save = useMutation({
    mutationFn: (c: Choice) => setMyGender(c === "none" ? null : c),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionalMe"] });
      showAlert(t("profile.saved"));
    },
    onError: (err) => showAlert(t("profile.saveFailed"), extractErrorMessage(err, t("common.checkConnection"))),
  });

  return (
    <ScreenContainer title={t("profile.title")}>
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
        {t("profile.back")}
      </Text>

      {me.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : me.isError ? (
        <ErrorState onRetry={() => me.refetch()} />
      ) : (
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("profile.genderTitle")}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 4 }}>{t("profile.genderHelp")}</Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {OPTIONS.map((o) => (
              <SelectCard key={o.value} title={t(o.key)} selected={choice === o.value} onPress={() => setChoice(o.value)} />
            ))}
          </View>
          <Button
            label={t("common.save")}
            onPress={() => choice && save.mutate(choice)}
            loading={save.isPending}
            disabled={!choice || choice === current}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      )}
    </ScreenContainer>
  );
}
